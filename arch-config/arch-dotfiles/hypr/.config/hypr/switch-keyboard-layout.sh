#!/bin/bash

# Get the list of actual keyboard devices (exclude virtual/system devices)
keyboards=(
    "at-translated-set-2-keyboard"
    "dygma-defy-keyboard" 
    "logitech-mx-master-3-for-mac"
)

# Switch layout for each keyboard
for kb in "${keyboards[@]}"; do
    hyprctl switchxkblayout "$kb" next
done