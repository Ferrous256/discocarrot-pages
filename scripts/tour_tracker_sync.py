"""
Weekly Gmail → TourTracker sync for Disco Carrot.

Reads the past 7 days of email, uses Claude to extract outreach activity,
then updates the DiscoCarrot TourTracker Google Sheet directly via Sheets API.

Required environment variables:
  ANTHROPIC_API_KEY
  GOOGLE_CLIENT_ID
  GOOGLE_CLIENT_SECRET
  GOOGLE_REFRESH_TOKEN
  GDRIVE_TRACKER_FILE_ID   (Google Sheet ID for DiscoCarrot TourTracker)
"""

import json
import os
import sys
from datetime import datetime, timedelta, timezone

import anthropic
from google.auth.transport.requests import Request
from google.oauth2.credentials import Credentials
from googleapiclient.discovery import build


# ── Constants ────────────────────────────────────────────────────────────────

SHEET_ID = os.environ["GDRIVE_TRACKER_FILE_ID"]
TAB = "Outreach Tracker"

# Column letters (A=0) matching the sheet layout:
# A  Resort or Venue
# B  State
# C  Region
# D  Tier
# E  Books DJs/Music?
# F  Season Open
# G  Season Close
# H  Contact Name
# I  Contact Email
# J  Contact Phone
# K  Outreach Type
# L  Status
# M  Date First Contacted
# N  Date Last Contact
# O  Next Follow-up
# P  Preferred Tour Window
# Q  Booked Date(s)
# R  Notes

COL_INDEX = {
    "resort": 0, "state": 1, "region": 2, "tier": 3, "books_djs": 4,
    "season_open": 5, "season_close": 6, "contact_name": 7, "contact_email": 8,
    "contact_phone": 9, "outreach_type": 10, "status": 11, "date_first": 12,
    "date_last": 13, "next_followup": 14, "tour_window": 15,
    "booked_dates": 16, "notes": 17,
}

VALID_STATUSES = [
    "Not Contacted", "Email Sent", "Follow-up Sent", "Replied",
    "In Discussion", "Booked", "Declined", "On Hold",
]


# ── Google auth ───────────────────────────────────────────────────────────────

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


# ── Gmail helpers ─────────────────────────────────────────────────────────────

def fetch_week_emails(gmail):
    since = (datetime.now(timezone.utc) - timedelta(days=7)).strftime("%Y/%m/%d")
    result = gmail.users().messages().list(
        userId="me", q=f"after:{since}", maxResults=200
    ).execute()
    messages = result.get("messages", [])
    print(f"Found {len(messages)} emails in the past 7 days.")

    summaries = []
    for msg_ref in messages:
        msg = gmail.users().messages().get(
            userId="me", id=msg_ref["id"], format="metadata",
            metadataHeaders=["From", "To", "Subject", "Date"],
        ).execute()
        headers = {h["name"]: h["value"] for h in msg["payload"]["headers"]}
        summaries.append(
            f"From: {headers.get('From','')}\n"
            f"To: {headers.get('To','')}\n"
            f"Subject: {headers.get('Subject','')}\n"
            f"Date: {headers.get('Date','')}\n"
            f"Snippet: {msg.get('snippet','')}\n"
        )
    return summaries


# ── Claude analysis ───────────────────────────────────────────────────────────

def analyze_emails_with_claude(email_summaries: list[str]) -> list[dict]:
    client = anthropic.Anthropic(api_key=os.environ["ANTHROPIC_API_KEY"])
    email_block = "\n---\n".join(email_summaries) if email_summaries else "(no emails)"

    prompt = f"""You are helping update the Disco Carrot tour booking tracker.

Disco Carrot is a DJ/live music act that books performances at ski resorts and live events.
The tracker has one row per resort or venue and tracks outreach status.

Valid status values:
{json.dumps(VALID_STATUSES, indent=2)}

Here are all emails from the past 7 days:

{email_block}

Analyze these emails and identify any outreach activity related to ski resort or venue bookings.
For each resort/venue where something happened, return a JSON array of update objects.

Each update object must have:
- "resort" (string): exact resort or venue name as it appears in the tracker
- "status" (string): one of the valid statuses, only if status changed
- "contact_name" (string, optional): if a contact was identified
- "contact_email" (string, optional): if a contact email was found
- "contact_phone" (string, optional): if a phone number was found
- "date_last" (string, optional): date of most recent contact, YYYY-MM-DD
- "date_first" (string, optional): date of first contact if new outreach, YYYY-MM-DD
- "next_followup" (string, optional): suggested follow-up date, YYYY-MM-DD
- "outreach_type" (string, optional): "Cold", "Warm", "Referral", etc.
- "booked_dates" (string, optional): if dates were confirmed
- "notes" (string, optional): any relevant notes to append

Return ONLY a valid JSON array. If no relevant outreach activity was found, return []."""

    response = client.messages.create(
        model="claude-opus-4-7",
        max_tokens=4096,
        messages=[{"role": "user", "content": prompt}],
    )
    raw = response.content[0].text.strip()
    if raw.startswith("```"):
        raw = raw.split("\n", 1)[1].rsplit("```", 1)[0]

    updates = json.loads(raw)
    print(f"Claude identified {len(updates)} tracker update(s).")
    return updates


# ── Sheets helpers ────────────────────────────────────────────────────────────

def read_sheet(sheets) -> list[list]:
    result = sheets.spreadsheets().values().get(
        spreadsheetId=SHEET_ID,
        range=f"{TAB}!A:R",
    ).execute()
    return result.get("values", [])


def col_letter(index: int) -> str:
    return chr(ord("A") + index)


def apply_updates(sheets, rows: list[list], updates: list[dict]):
    if not rows:
        print("Sheet appears empty, skipping updates.")
        return

    today = datetime.now(timezone.utc).strftime("%Y-%m-%d")

    # Build resort → row number lookup (1-based, row 1 = header)
    resort_to_rownum = {}
    for i, row in enumerate(rows[1:], start=2):
        if row and row[0]:
            resort_to_rownum[row[0].strip().lower()] = (i, row)

    value_ranges = []

    for update in updates:
        key = update.get("resort", "").strip().lower()
        match = resort_to_rownum.get(key)
        if not match:
            print(f"  ⚠ No row found for: {update.get('resort')!r}")
            continue

        rownum, current = match

        def get_current(col_key):
            idx = COL_INDEX[col_key]
            return current[idx] if idx < len(current) else ""

        def make_range(col_key):
            return f"{TAB}!{col_letter(COL_INDEX[col_key])}{rownum}"

        def queue(col_key, value):
            if value:
                value_ranges.append({
                    "range": make_range(col_key),
                    "values": [[value]],
                })

        queue("status", update.get("status"))
        queue("contact_name", update.get("contact_name"))
        queue("contact_email", update.get("contact_email"))
        queue("contact_phone", update.get("contact_phone"))
        queue("date_last", update.get("date_last") or today)
        queue("next_followup", update.get("next_followup"))
        queue("outreach_type", update.get("outreach_type"))
        queue("booked_dates", update.get("booked_dates"))

        # Append notes
        if update.get("notes"):
            existing = get_current("notes")
            sep = "\n" if existing else ""
            value_ranges.append({
                "range": make_range("notes"),
                "values": [[f"{existing}{sep}[{today}] {update['notes']}"]],
            })

        # Set date_first only if currently empty
        if update.get("date_first") and not get_current("date_first"):
            queue("date_first", update["date_first"])

        print(f"  ✓ Queued update: {update.get('resort')} → {update.get('status', '(no status change)')}")

    if not value_ranges:
        print("No cell updates to write.")
        return

    sheets.spreadsheets().values().batchUpdate(
        spreadsheetId=SHEET_ID,
        body={"valueInputOption": "RAW", "data": value_ranges},
    ).execute()
    print(f"Wrote {len(value_ranges)} cell update(s) to sheet.")


# ── Main ──────────────────────────────────────────────────────────────────────

def main():
    print(f"=== Disco Carrot TourTracker sync — {datetime.now(timezone.utc).isoformat()} ===")

    creds = _google_creds()
    gmail = build("gmail", "v1", credentials=creds)
    sheets = build("sheets", "v4", credentials=creds)

    email_summaries = fetch_week_emails(gmail)
    updates = analyze_emails_with_claude(email_summaries)

    if not updates:
        print("No outreach activity detected. Sheet unchanged.")
        sys.exit(0)

    rows = read_sheet(sheets)
    apply_updates(sheets, rows, updates)
    print("=== Sync complete ===")


if __name__ == "__main__":
    main()
