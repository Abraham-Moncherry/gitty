#!/bin/bash
# Overwrite Plasmo's greyscale icons with colored versions from assets/
# Usage: ./scripts/fix-icons.sh <build-dir>
#   e.g. ./scripts/fix-icons.sh build/chrome-mv3-dev

BUILD_DIR="${1:-build/chrome-mv3-dev}"
ASSETS_DIR="$(dirname "$0")/../assets"

for size in 16 32 48 64 128; do
  src="$ASSETS_DIR/icon${size}.png"
  if [ -f "$src" ]; then
    # Find the plasmo-generated icon file for this size
    target=$(find "$BUILD_DIR" -name "icon${size}.plasmo.*.png" 2>/dev/null | head -1)
    if [ -n "$target" ]; then
      cp "$src" "$target"
    fi
  fi
done
