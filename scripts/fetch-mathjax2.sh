#!/usr/bin/env bash
set -euo pipefail

version="2.7.9"
root_dir="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
dest_dir="$root_dir/public/assets/vendor/mathjax"
tmp_dir="$(mktemp -d)"
archive="$tmp_dir/mathjax.zip"

cleanup() {
  rm -rf "$tmp_dir"
}
trap cleanup EXIT

curl -fsSL "https://github.com/mathjax/MathJax/archive/refs/tags/${version}.zip" -o "$archive"
unzip -q "$archive" -d "$tmp_dir"

src_dir="$tmp_dir/MathJax-${version}"
if [[ ! -d "$src_dir" ]]; then
  echo "MathJax source directory not found: $src_dir" >&2
  exit 1
fi

rm -rf "$dest_dir"
mkdir -p "$dest_dir"

for path in MathJax.js config jax extensions fonts; do
  if [[ ! -e "$src_dir/$path" ]]; then
    echo "Missing $path in MathJax archive." >&2
    exit 1
  fi
  cp -R "$src_dir/$path" "$dest_dir/"
done

echo "MathJax v${version} installed to $dest_dir"
