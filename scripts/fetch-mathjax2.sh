#!/usr/bin/env bash
set -euo pipefail

APP_DIR="${1:-public}"
TARGET="${APP_DIR}/assets/vendor/mathjax"
TMP="$(mktemp -d)"

cleanup() {
  rm -rf "$TMP"
}
trap cleanup EXIT

echo "Downloading MathJax v2.7.9 via npm pack..."
pushd "$TMP" >/dev/null
npm pack mathjax@2.7.9 >/dev/null
TARBALL="$(ls mathjax-2.7.9.tgz)"
tar -xzf "$TARBALL"
popd >/dev/null

echo "Installing into: $TARGET"
rm -rf "$TARGET"
mkdir -p "$TARGET"

# npm pack extracts to $TMP/package/...
SRC="$TMP/package"
# Copy core + configs + TeX input + HTML-CSS output + needed assets
cp -R "$SRC/MathJax.js" "$TARGET/"
cp -R "$SRC/config" "$TARGET/"
cp -R "$SRC/jax" "$TARGET/"
cp -R "$SRC/extensions" "$TARGET/"
cp -R "$SRC/fonts" "$TARGET/"

echo "MathJax installed. Sanity check:"
test -f "$TARGET/MathJax.js"
echo "OK: $TARGET/MathJax.js exists"
