"""
One-time script: adds Tahoe Live and SLC Live rows to the Outreach Tracker
and renames 'Resort Name' → 'Resort or Venue'.

Run via the add-live-venues GitHub Actions workflow.
"""

import os
from google.auth.transport.requests import Request
from google.oauth2.credentials import Credentials
from googleapiclient.discovery import build

SHEET_ID = os.environ["GDRIVE_TRACKER_FILE_ID"]
TAB = "Outreach Tracker"


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


def main():
    creds = _google_creds()
    sheets = build("sheets", "v4", credentials=creds)

    # Find next empty row
    result = sheets.spreadsheets().values().get(
        spreadsheetId=SHEET_ID,
        range=f"{TAB}!A:A",
    ).execute()
    next_row = len(result.get("values", [])) + 1

    # Columns: A=Resort or Venue, B=State, C=Region, D=Tier, E=Books DJs/Music?,
    # F=Season Open, G=Season Close, H=Contact Name, I=Contact Email,
    # J=Contact Phone, K=Outreach Type, L=Status,
    # M=Date First Contacted, N=Date Last Contact, O=Next Follow-up,
    # P=Preferred Tour Window, Q=Booked Date(s), R=Notes

    new_rows = [
        [
            "Tahoe Live (Palisades Tahoe)", "CA", "California", 1, "Yes",
            "", "", "Dustin", "dustin@parkcitylive.us", "",
            "Cold", "Email Sent", "2026-05-13", "2026-05-13", "2026-05-20", "", "",
            "Festival/event organizer at Palisades Tahoe. Pitched snowcat side-stage between mainstage acts. Same contact manages SLC Live. Follow up ~7 days.",
        ],
        [
            "SLC Live (The Gateway Olympic Legacy Plaza)", "UT", "Utah", 1, "Yes",
            "", "", "Dustin", "dustin@parkcitylive.us", "",
            "Cold", "Email Sent", "2026-05-13", "2026-05-13", "2026-05-20", "", "",
            "Festival/event organizer at The Gateway Olympic Legacy Plaza, SLC. Pitched Sierra-Wasatch snowcat moment for urban venue. Same contact manages Tahoe Live. Follow up ~7 days.",
        ],
    ]

    updates = [
        # Rename header
        {"range": f"{TAB}!A1", "values": [["Resort or Venue"]]},
        # Append new rows
        {"range": f"{TAB}!A{next_row}:R{next_row + 1}", "values": new_rows},
    ]

    sheets.spreadsheets().values().batchUpdate(
        spreadsheetId=SHEET_ID,
        body={"valueInputOption": "RAW", "data": updates},
    ).execute()

    print(f"Header updated. Added rows {next_row} and {next_row + 1}.")
    print("  Tahoe Live (Palisades Tahoe) — dustin@parkcitylive.us")
    print("  SLC Live (The Gateway Olympic Legacy Plaza) — dustin@parkcitylive.us")


if __name__ == "__main__":
    main()
