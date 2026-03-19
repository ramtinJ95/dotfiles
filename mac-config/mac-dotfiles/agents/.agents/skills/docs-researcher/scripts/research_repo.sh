#!/usr/bin/env bash
set -euo pipefail

if [[ $# -lt 2 || $# -gt 3 ]]; then
  echo "Usage: $(basename "$0") <owner/repo> <pattern> [path_glob]" >&2
  exit 1
fi

repo="$1"
pattern="$2"
path_glob="${3:-}"

if [[ "$repo" != */* ]]; then
  echo "Repository must be in owner/repo format." >&2
  exit 1
fi

tmp_root="/tmp/docs-research"
safe_repo="${repo//\//-}"
dest="${tmp_root}/${safe_repo}-$(date +%s)"

mkdir -p "$tmp_root"
git clone --depth 1 "https://github.com/${repo}.git" "$dest" >/dev/null

echo "Repository cloned to: $dest"
echo "Pattern: $pattern"
if [[ -n "$path_glob" ]]; then
  echo "Path filter: $path_glob"
fi
echo
echo "Matches:"

rg_args=(
  -n
  --hidden
  -g '!**/.git/**'
  -g '!**/node_modules/**'
  -g '!**/dist/**'
  -g '!**/build/**'
)

if [[ -n "$path_glob" ]]; then
  rg_args+=(-g "$path_glob")
fi

rg "${rg_args[@]}" "$pattern" "$dest" || true

echo
echo "Potential documentation files:"
rg --files "$dest" | rg -i '(readme|docs|guide|example|reference|api)' || true
