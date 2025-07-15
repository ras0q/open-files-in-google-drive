# Open Files in Google Drive

## Overview

"Open Files in Google Drive" is a browser extension that helps you quickly open
the Google Drive version of a local file if it exists. The extension
automatically checks for matching files in Google Drive and gives instant access
with a single click.

## Features

- Automatically find matching Drive files for local files
- Click extension icon to open the matched file in Drive
- Visual icon states indicate match status

## Installation & Build

1. Clone this repository:
   ```bash
   git clone https://github.com/ras0q/open-files-in-google-drive.git
   cd open-files-in-google-drive
   ```
2. Build the extension:
   ```bash
   deno task build
   ```
3. Load the extension in your browser:
   - Open your browser's extensions page
   - Select "Load unpacked extension" and choose the build directory
4. (Optional) Set up Google OAuth2 credentials:
   - Create credentials at Google Cloud Platform
   - Update `src/manifest.json` with your client ID and scopes

## Usage

- Click the extension icon. If you are not authenticated, you will be prompted
  to sign in with your Google account.
- When viewing a local file, the icon will show its status:
  - Default (Blue): waiting for match
  - Login (Red): authentication required
  - Full (Green): file match found
  - Partial (Yellow): partial match found
  - None (Transparent blue): no match found or not a local file
- Click the icon when a match is found to open the Google Drive file in a new
  tab.
- Notifications will appear for authentication, errors, and match results.

## Permissions & Dependencies

- Requires permissions: identity, storage, notifications, activeTab, scripting
- Uses Google Drive API (`drive.readonly` scope)
- Uses `webextension-polyfill` for browser compatibility

## Contribution & License

Contributions are welcome! Please open issues or submit pull requests. For
license information, see the LICENSE file (default is MIT License).
