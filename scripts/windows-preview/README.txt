KinnsoOS - Windows preview

1. Extract the whole ZIP to a folder on your computer.
2. Double-click Start-Kinnso.cmd in the extracted folder.
3. Keep its terminal window open while using Kinnso.

Node.js 24 LTS is recommended (minimum: 22.13). If Node.js is missing,
the launcher tells you where to install it. The first run installs the
pinned dependencies using npm ci and requires internet access.

The launcher starts the actual app from its own app folder. It checks that
the homepage has rendered before opening your Windows browser. It prefers
port 8772 and selects another available port if necessary. Use the address
printed by this launcher, not a cloud-workspace localhost link.

To try the new flow:
Plan my trip -> enter your idea -> Review brief -> Prepare a trip draft.
Review the itinerary and explicitly confirm saving on this device.

Device drafts stay in this browser and can be reopened from the trip
workspace. Anyone using the same browser can read those device drafts.
Account services are disabled in this credential-free preview.

Close the terminal or press Ctrl+C to stop the preview. Running the
launcher again reuses the installed dependencies when the lockfile matches.
The extracted app includes its GPL license, source attribution and complete
corresponding-source download. No Linux dependencies or private environment
files are shipped.

Optional commands, from the extracted folder:
  node launcher.mjs --check
  node launcher.mjs --no-open
  node launcher.mjs --port=8772
