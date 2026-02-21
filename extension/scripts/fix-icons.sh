#!/bin/bash
# Overwrite Plasmo's greyscale icons with colored versions from assets/
# Usage: ./scripts/fix-icons.sh <build-dir>
#   e.g. ./scripts/fix-icons.sh build/chrome-mv3-dev

BUILD_DIR="${1:-build/chrome-mv3-dev}"
ASSETS_DIR="$(dirname "$0")/../assets"

fixed=0
for size in 16 32 48 64 128; do
  src="$ASSETS_DIR/icon${size}.png"
  if [ -f "$src" ]; then
    target=$(find "$BUILD_DIR" -name "icon${size}.plasmo.*.png" 2>/dev/null | head -1)
    if [ -n "$target" ] && ! cmp -s "$src" "$target"; then
      cp "$src" "$target"
      fixed=$((fixed + 1))
    fi
  fi
done

if [ "$fixed" -gt 0 ]; then
  echo "  -> Replaced $fixed greyscale icon(s) with color versions"
fi
