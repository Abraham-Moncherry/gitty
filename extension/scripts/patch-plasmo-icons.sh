#!/bin/bash
# Patch Plasmo to never greyscale extension icons during dev mode.
# Plasmo applies .grayscale()/.greyscale() to icons that don't have
# ".development." in the filename, which turns our colored icons grey.
# This postinstall script removes those calls from the bundled source.

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
PLASMO_DIST="$SCRIPT_DIR/../node_modules/plasmo/dist/index.js"

if [ ! -f "$PLASMO_DIST" ]; then
  exit 0
fi

# Check if already patched
if grep -q "PATCHED_NO_GREYSCALE" "$PLASMO_DIST" 2>/dev/null; then
  exit 0
fi

# Use node for reliable replacement of minified JS
node -e "
const fs = require('fs');
const path = require('path');
let src = fs.readFileSync(path.resolve('$PLASMO_DIST'), 'utf8');

// Strategy: replace every .greyscale(...) and .grayscale() with nothing
// by finding the balanced parens after .greyscale/.grayscale
function removeCall(str, method) {
  let result = str;
  let searchFrom = 0;
  while (true) {
    const idx = result.indexOf('.' + method + '(', searchFrom);
    if (idx === -1) break;
    // Find the matching closing paren
    let depth = 0;
    let start = idx;
    let i = idx + method.length + 2; // skip past '.<method>('
    depth = 1;
    while (i < result.length && depth > 0) {
      if (result[i] === '(') depth++;
      if (result[i] === ')') depth--;
      i++;
    }
    // Remove from idx to i (the full .<method>(...))
    result = result.substring(0, idx) + result.substring(i);
    searchFrom = idx;
  }
  return result;
}

src = removeCall(src, 'greyscale');
src = removeCall(src, 'grayscale');
src += '\n// PATCHED_NO_GREYSCALE\n';
fs.writeFileSync(path.resolve('$PLASMO_DIST'), src);
"

echo "Patched Plasmo: disabled icon greyscale in dev mode"
