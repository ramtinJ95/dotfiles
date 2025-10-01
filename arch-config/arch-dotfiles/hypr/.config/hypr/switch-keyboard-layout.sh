#!/bin/bash

set -euo pipefail

# Try to detect all current keyboards dynamically via hyprctl JSON
readarray -t dyn_kbs < <(hyprctl -j devices 2>/dev/null | jq -r '.keyboards[].name' 2>/dev/null || true)

# Fallback list of known keyboards if dynamic detection fails
fallback_kbs=(
    "at-translated-set-2-keyboard"
    "dygma-defy-keyboard"
)

# Prefer dynamic list if available, else fallback
if [ "${#dyn_kbs[@]}" -gt 0 ]; then
    keyboards=("${dyn_kbs[@]}")
else
    keyboards=("${fallback_kbs[@]}")
fi

# Switch layout for each detected keyboard
for kb in "${keyboards[@]}"; do
    [ -n "$kb" ] || continue
    hyprctl switchxkblayout "$kb" next >/dev/null 2>&1 || true
done
