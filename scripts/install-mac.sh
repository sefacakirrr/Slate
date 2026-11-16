#!/bin/bash
# Installs (or updates) Slate on macOS from the latest GitHub release.
#
#   curl -fsSL https://raw.githubusercontent.com/sefacakirrr/Slate/main/scripts/install-mac.sh | bash
#
# Slate is not signed with an Apple Developer ID, so a DMG downloaded in a
# browser gets the quarantine flag and Gatekeeper blocks the app. curl does not
# set that flag; the xattr below also clears any flag left from an earlier
# browser install. Re-run the same command to update.
set -euo pipefail

REPO="sefacakirrr/Slate"
APP="/Applications/Slate.app"

if [ "$(uname -s)" != "Darwin" ]; then
  echo "This installer is for macOS." >&2
  exit 1
fi

# Rosetta shells report x86_64 on Apple Silicon; ask the hardware instead.
if [ "$(sysctl -n hw.optional.arm64 2>/dev/null || echo 0)" != "1" ]; then
  echo "Slate for Mac currently supports Apple Silicon (M1 or later) only." >&2
  exit 1
fi

echo "Finding the latest Slate release..."
URL=$(curl -fsSL "https://api.github.com/repos/$REPO/releases/latest" |
  grep -o '"browser_download_url": *"[^"]*-arm64\.dmg"' |
  head -n 1 | sed 's/.*"\(https[^"]*\)"/\1/')
if [ -z "$URL" ]; then
  echo "No Mac download found in the latest release: https://github.com/$REPO/releases" >&2
  exit 1
fi

TMP=$(mktemp -d)
MNT="$TMP/mnt"
cleanup() {
  hdiutil detach "$MNT" -quiet 2>/dev/null || true
  rm -rf "$TMP"
}
trap cleanup EXIT

echo "Downloading $(basename "$URL")..."
curl -fL --progress-bar -o "$TMP/Slate.dmg" "$URL"

mkdir -p "$MNT"
hdiutil attach "$TMP/Slate.dmg" -nobrowse -readonly -quiet -mountpoint "$MNT"

if pgrep -xq Slate; then
  echo "Closing Slate..."
  osascript -e 'quit app "Slate"' 2>/dev/null || true
  sleep 2
fi

echo "Installing to $APP..."
rm -rf "$APP"
ditto "$MNT/Slate.app" "$APP"
xattr -cr "$APP"

echo "Done. Opening Slate."
open "$APP"
