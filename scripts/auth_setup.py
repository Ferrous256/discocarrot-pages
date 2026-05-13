"""
One-time script to obtain a Google OAuth2 refresh token.

Run this ONCE on your local machine to get the refresh token you'll
store as a GitHub secret. You never need to run it again.

Usage:
  pip install google-auth-oauthlib
  python scripts/auth_setup.py
"""

import json
from google_auth_oauthlib.flow import InstalledAppFlow

SCOPES = [
    "https://www.googleapis.com/auth/gmail.readonly",
    "https://www.googleapis.com/auth/drive",
]

def main():
    print("This script will open your browser to authorize access to Gmail and Drive.")
    print()
    print("Before running, you need a client_secrets.json file from Google Cloud Console:")
    print("  1. Go to https://console.cloud.google.com/")
    print("  2. Create a project (or use an existing one)")
    print("  3. Enable the Gmail API and Google Drive API")
    print("  4. Go to APIs & Services → Credentials")
    print("  5. Create an OAuth 2.0 Client ID (type: Desktop app)")
    print("  6. Download the JSON and save it as client_secrets.json in this folder")
    print()

    secrets_path = input("Path to client_secrets.json [./client_secrets.json]: ").strip()
    if not secrets_path:
        secrets_path = "client_secrets.json"

    flow = InstalledAppFlow.from_client_secrets_file(secrets_path, SCOPES)
    creds = flow.run_local_server(port=0)

    print()
    print("=" * 60)
    print("SUCCESS — store these as GitHub repository secrets:")
    print("=" * 60)
    print(f"GOOGLE_CLIENT_ID      = {creds.client_id}")
    print(f"GOOGLE_CLIENT_SECRET  = {creds.client_secret}")
    print(f"GOOGLE_REFRESH_TOKEN  = {creds.refresh_token}")
    print()
    print("Also add these secrets:")
    print("  ANTHROPIC_API_KEY     = (from console.anthropic.com)")
    print("  GDRIVE_TRACKER_FILE_ID   = 1W9w9iYxLUqND5OvMcUvG2QjNcnClnU2b")
    print("  GDRIVE_ARCHIVE_FOLDER_ID = (the Drive folder ID where archives should go)")

if __name__ == "__main__":
    main()
