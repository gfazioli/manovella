#!/bin/bash
# Builds one Studio's window app from main.swift and installs it, so that Studio opens in a window with
# its own name and icon instead of a Chrome app window.
#
#   studio/window/build.sh <studio folder> [<destination folder>]
#
# The studio folder holds what makes the app that Studio's:
#   studio.json     the Studio's identity, which its page reads too: { "name": "<App Name>", "id": "<short-id>",
#                   "version": "1.1.0", "ping": "/api/ping", "hint": "…", "width": 1360, "height": 900,
#                   "bundleId": "…", "appearance": "dark", "pageItems": [{ "id": "about" }] }   (name, id and
#                   version are required; appearance "dark" or "light" fixes the window's, none follows the
#                   Mac's; pageItems are app-menu items the page answers, README)
#   icon-1024.png   the icon, drawn by make-icon.swift
# It installs "<name>.app" in ~/Applications (or the folder given). The Studio's launcher looks for it
# there and falls back to Chrome when it is missing, so this is per Mac and optional: the bundle is not
# in git, and a rebuild is needed after a change to main.swift. Ad-hoc signed: a local tool, never
# distributed. An open window keeps the build it started with until it closes.
set -euo pipefail
HERE="$(cd "$(dirname "$0")" && pwd)"
STUDIO="$(cd "${1:?usage: build.sh <studio folder> [<destination folder>]}" && pwd)"
DEST="${2:-$HOME/Applications}"
CONF="$STUDIO/studio.json"
ICON="$STUDIO/icon-1024.png"
[ -f "$CONF" ] || { echo "FAILED no studio.json in $STUDIO"; exit 1; }
[ -f "$ICON" ] || { echo "FAILED no icon-1024.png in $STUDIO"; exit 1; }
get() { plutil -extract "$1" raw -o - "$CONF" 2>/dev/null || printf '%s' "${2-}"; }
NAME="$(get name)"
ID="$(get id)"
VERSION="$(get version)"
[ -n "$NAME" ] && [ -n "$ID" ] && [ -n "$VERSION" ] || { echo "FAILED studio.json needs a name, an id and a version"; exit 1; }
BUNDLE_ID="$(get bundleId "local.studio-window.$ID")"
PING="$(get ping /api/ping)"
HINT="$(get hint "$NAME opens from its Studio.")"
WIDTH="$(get width 1360)"
HEIGHT="$(get height 900)"
APPEARANCE="$(get appearance '')"
case "$APPEARANCE" in ''|dark|light) ;; *) echo "FAILED appearance is \"dark\", \"light\" or absent, not \"$APPEARANCE\""; exit 1;; esac
ITEMS="$(plutil -extract pageItems json -o - "$CONF" 2>/dev/null || true)"   # an array of { id, title?, key? }
if [ -n "$ITEMS" ] && ! python3 -I -c 'import json,re,sys; a=json.loads(sys.argv[1]); sys.exit(not (isinstance(a,list) and all(isinstance(i,dict) and isinstance(i.get("id"),str) and re.fullmatch(r"[a-z0-9-]+",i["id"]) and isinstance(i.get("title",""),str) and isinstance(i.get("key",""),str) and len(i.get("key",""))<=1 for i in a)))' "$ITEMS"; then
  echo "FAILED pageItems is a list of { \"id\": \"<a-z0-9->\", \"title\": \"…\", \"key\": \"<one character>\" }"; exit 1
fi
APP="$DEST/$NAME.app"
WORK="$(mktemp -d)"
trap 'rm -rf "$WORK"' EXIT

# the binary: warnings and errors land in a log, read in full, never through tail
if ! swiftc -O -swift-version 5 -target "$(uname -m)-apple-macos13.0" -o "$WORK/$NAME" "$HERE/main.swift" \
    -framework Cocoa -framework WebKit >"$WORK/build.log" 2>&1; then
  grep -E "error:" "$WORK/build.log" || cat "$WORK/build.log"
  echo "FAILED swiftc"; exit 1
fi
if grep -q "warning:" "$WORK/build.log"; then grep "warning:" "$WORK/build.log"; fi

# the bundle; the plist is written by plutil, so a name or a hint never has to be XML-escaped by hand
B="$WORK/$NAME.app/Contents"
mkdir -p "$B/MacOS" "$B/Resources"
mv "$WORK/$NAME" "$B/MacOS/"
kit="$(git -C "$HERE" log -1 --format=%h -- . 2>/dev/null || true)"   # which build of this kit: the bundle version
P="$B/Info.plist"
plutil -create xml1 "$P"
for kv in "CFBundleIdentifier:$BUNDLE_ID" "CFBundleName:$NAME" "CFBundleDisplayName:$NAME" "CFBundleExecutable:$NAME" \
          "CFBundleIconFile:AppIcon" "CFBundlePackageType:APPL" "CFBundleShortVersionString:$VERSION" "CFBundleVersion:${kit:-dev}" \
          "LSMinimumSystemVersion:13.0" "LSApplicationCategoryType:public.app-category.developer-tools" \
          "NSPrincipalClass:NSApplication" "SWPingPath:$PING" "SWHint:$HINT"; do
  plutil -insert "${kv%%:*}" -string "${kv#*:}" "$P"
done
plutil -insert NSHighResolutionCapable -bool true "$P"
plutil -insert SWWidth -float "$WIDTH" "$P"
plutil -insert SWHeight -float "$HEIGHT" "$P"
[ -n "$APPEARANCE" ] && plutil -insert SWAppearance -string "$APPEARANCE" "$P"
[ -n "$ITEMS" ] && plutil -insert SWPageItems -json "$ITEMS" "$P"
plutil -insert NSAppTransportSecurity -json '{"NSAllowsLocalNetworking":true}' "$P"
plutil -lint -s "$P"
ICONSET="$WORK/AppIcon.iconset"; mkdir -p "$ICONSET"
for s in 16 32 128 256 512; do
  sips -z $s $s "$ICON" --out "$ICONSET/icon_${s}x${s}.png" >/dev/null
  sips -z $((s * 2)) $((s * 2)) "$ICON" --out "$ICONSET/icon_${s}x${s}@2x.png" >/dev/null
done
iconutil -c icns -o "$B/Resources/AppIcon.icns" "$ICONSET"
codesign --force --sign - "$WORK/$NAME.app" 2>/dev/null

mkdir -p "$DEST"
rm -rf "$APP"
ditto "$WORK/$NAME.app" "$APP"
/System/Library/Frameworks/CoreServices.framework/Frameworks/LaunchServices.framework/Support/lsregister -f "$APP"
echo "INSTALLED $APP ($NAME $VERSION, kit ${kit:-dev}, $BUNDLE_ID)"
