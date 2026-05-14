"""
Daily follow-up draft generator for Disco Carrot.

Reads the TourTracker sheet each morning, finds venues due for follow-up,
generates reply drafts in Gmail using Claude, applies the 'Claude' label,
and updates the tracker notes.

Required environment variables:
  ANTHROPIC_API_KEY
  GOOGLE_CLIENT_ID
  GOOGLE_CLIENT_SECRET
  GOOGLE_REFRESH_TOKEN
  GDRIVE_TRACKER_FILE_ID
"""

import base64
import json
import os
from datetime import date, timedelta
from email.mime.text import MIMEText

import anthropic
from google.auth.transport.requests import Request
from google.oauth2.credentials import Credentials
from googleapiclient.discovery import build


# ── Constants ────────────────────────────────────────────

SHEET_ID = os.environ["GDRIVE_TRACKER_FILE_ID"]
TAB = "Outreach Tracker"

COL_INDEX = {
    "resort": 0, "state": 1, "region": 2, "tier": 3, "books_djs": 4,
    "season_open": 5, "season_close": 6, "contact_name": 7, "contact_email": 8,
    "contact_phone": 9, "outreach_type": 10, "status": 11, "date_first": 12,
    "date_last": 13, "next_followup": 14, "tour_window": 15,
    "booked_dates": 16, "notes": 17,
}

SKIP_STATUSES = {"Booked", "Declined", "Not Contacted", "On Hold"}


# ── Auth ──────────────────────────────────────────────────────

def _google_creds():
    creds = Credentials(
        token=None,
        refresh_token=os.environ["GOOGLE_REFRESH_TOKEN"],
        client_id=os.environ["GOOGLE_CLIENT_ID"],
        client_secret=os.environ["GOOGLE_CLIENT_SECRET"],
        token_uri="https://oauth2.googleapis.com/token",
        scopes=[
            "https://mail.google.com/",
            "https://www.googleapis.com/auth/spreadsheets",
        ],
    )
    creds.refresh(Request())
    return creds


# ── Tracker helpers ───────────────────────────────────────────────

def cell(row: list, col_key: str) -> str:
    idx = COL_INDEX[col_key]
    return row[idx].strip() if idx < len(row) and row[idx] else ""


def find_due_followups(rows: list[list]) -> list[tuple[int, list]]:
    today = date.today()
    due = []

    for i, row in enumerate(rows[1:], start=2):
        if not row or not row[0]:
            continue

        status = cell(row, "status")
        contact_email = cell(row, "contact_email")

        if not contact_email or status in SKIP_STATUSES:
            continue

        next_followup = cell(row, "next_followup")
        date_last = cell(row, "date_last")

        # Rule 1: explicit follow-up date is today or overdue
        if next_followup:
            try:
                if date.fromisoformat(next_followup) <= today:
                    due.append((i, row))
                    continue
            except ValueError:
                pass

        if date_last:
            try:
                last = date.fromisoformat(date_last)
                days_since = (today - last).days

                # Rule 2: Email Sent, 7+ days, no follow-up date set
                if status == "Email Sent" and not next_followup and days_since >= 7:
                    due.append((i, row))
                    continue

                # Rule 3: Follow-up Sent, 14+ days
                if status == "Follow-up Sent" and days_since >= 14:
                    due.append((i, row))
                    continue

            except ValueError:
                pass

    return due


def update_tracker_note(sheets, rownum: int, current_row: list, draft_date: str):
    existing = cell(current_row, "notes")
    sep = "\n" if existing else ""
    new_notes = f"{existing}{sep}[{draft_date}] Drafted follow-up email"

    col = chr(ord("A") + COL_INDEX["notes"])
    sheets.spreadsheets().values().update(
        spreadsheetId=SHEET_ID,
        range=f"{TAB}!{col}{rownum}",
        valueInputOption="RAW",
        body={"values": [[new_notes]]},
    ).execute()


# ── Gmail helpers ─────────────────────────────────────────────────

def get_claude_label_id(gmail) -> str | None:
    labels = gmail.users().labels().list(userId="me").execute().get("labels", [])
    for label in labels:
        if label["name"].lower() == "claude":
            return label["id"]
    print("Warning: 'Claude' label not found — drafts will be created without it.")
    return None


def find_thread(gmail, contact_email: str) -> dict | None:
    query = f"(from:{contact_email} OR to:{contact_email})"
    result = gmail.users().threads().list(
        userId="me", q=query, maxResults=5
    ).execute()
    threads = result.get("threads", [])
    if not threads:
        return None
    return gmail.users().threads().get(
        userId="me", id=threads[0]["id"], format="full"
    ).execute()


def extract_thread_text(thread: dict) -> str:
    parts = []
    for msg in thread.get("messages", []):
        headers = {h["name"]: h["value"] for h in msg["payload"].get("headers", [])}
        body = _decode_body(msg["payload"])
        parts.append(
            f"From: {headers.get('From','')}
"
            f"Date: {headers.get('Date','')}
"
            f"Subject: {headers.get('Subject','')}

"
            f"{body[:1500]}"
        )
    return "
---
".join(parts)


def _decode_body(payload: dict) -> str:
    if "parts" in payload:
        for part in payload["parts"]:
            if part.get("mimeType") == "text/plain":
                data = part.get("body", {}).get("data", "")
                if data:
                    return base64.urlsafe_b64decode(data).decode("utf-8", errors="replace")
        return _decode_body(payload["parts"][0])
    data = payload.get("body", {}).get("data", "")
    if data:
        return base64.urlsafe_b64decode(data).decode("utf-8", errors="replace")
    return ""


def create_reply_draft(
    gmail,
    thread: dict,
    contact_email: str,
    body_text: str,
    claude_label_id: str | None,
) -> str:
    last_msg = thread["messages"][-1]
    headers = {h["name"]: h["value"] for h in last_msg["payload"].get("headers", [])}

    subject = headers.get("Subject", "")
    if not subject.lower().startswith("re:"):
        subject = f"Re: {subject}"
    message_id = headers.get("Message-ID", "")

    mime = MIMEText(body_text, "plain")
    mime["To"] = contact_email
    mime["Subject"] = subject
    if message_id:
        mime["In-Reply-To"] = message_id
        mime["References"] = message_id

    raw = base64.urlsafe_b64encode(mime.as_bytes()).decode("utf-8")
    draft = gmail.users().drafts().create(
        userId="me",
        body={"message": {"raw": raw, "threadId": thread["id"]}},
    ).execute()

    if claude_label_id:
        gmail.users().messages().modify(
            userId="me",
            id=draft["message"]["id"],
            body={"addLabelIds": [claude_label_id]},
        ).execute()

    return draft["id"]


# ── Claude draft generation ───────────────────────────────────────────────

def generate_followup(venue_row: list, thread_text: str) -> str:
    client = anthropic.Anthropic(api_key=os.environ["ANTHROPIC_API_KEY"])

    prompt = f"""You are writing a follow-up email on behalf of Brenden Hierro at Disco Carrot.

Disco Carrot is a mobile DJ stage and art installation built on a 1972 Thiokol Spryte snowcat, based in Missoula, MT. They are booking their 2026/27 winter ski resort tour across the western US.

Venue: {cell(venue_row, 'resort')}
Contact: {cell(venue_row, 'contact_name')} ({cell(venue_row, 'contact_email')})
Current Status: {cell(venue_row, 'status')}
Tier: {cell(venue_row, 'tier')}
Notes: {cell(venue_row, 'notes')}
Region: {cell(venue_row, 'region')}

Previous email thread:
{thread_text}

Write a short, warm follow-up email body. Rules:
- 3-5 sentences only
- Reference specific details from the thread or venue context
- Friendly and direct tone, not pushy
- Do NOT include a subject line
- Do NOT invent facts not present in the thread or notes
- End with this exact signature:

Brenden Hierro
Owner / Operator
406.552.2528
brenden@discocarrot.com

Return ONLY the email body. No preamble, no explanation."""

    response = client.messages.create(
        model="claude-opus-4-7",
        max_tokens=512,
        messages=[{"role": "user", "content": prompt}],
    )
    return response.content[0].text.strip()


# ── Main ──────────────────────────────────────────────────────────────

def main():
    today = date.today().isoformat()
    print(f"=== Disco Carrot Follow-up Drafts — {today} ===")

    creds = _google_creds()
    gmail = build("gmail", "v1", credentials=creds)
    sheets = build("sheets", "v4", credentials=creds)

    claude_label_id = get_claude_label_id(gmail)

    rows = sheets.spreadsheets().values().get(
        spreadsheetId=SHEET_ID, range=f"{TAB}!A:R"
    ).execute().get("values", [])

    due = find_due_followups(rows)
    print(f"Found {len(due)} venue(s) due for follow-up.")

    if not due:
        print("Nothing to draft today.")
        return

    drafted = 0
    for rownum, venue_row in due:
        resort = cell(venue_row, "resort")
        contact_email = cell(venue_row, "contact_email")
        print(f"\n→ {resort} ({contact_email})")

        thread = find_thread(gmail, contact_email)
        if not thread:
            print(f"  ⚠ No Gmail thread found, skipping")
            continue

        body = generate_followup(venue_row, extract_thread_text(thread))
        draft_id = create_reply_draft(gmail, thread, contact_email, body, claude_label_id)
        update_tracker_note(sheets, rownum, venue_row, today)

        print(f"  ✓ Draft created (id={draft_id}), tracker updated")
        drafted += 1

    print(f"\n=== Done — {drafted} draft(s) created ===")


if __name__ == "__main__":
    main()
