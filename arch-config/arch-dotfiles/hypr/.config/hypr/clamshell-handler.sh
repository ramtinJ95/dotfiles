#!/bin/bash

# Script to handle clamshell mode properly with workspace management

set -euo pipefail

target_monitor=""

# Detect which external monitor is connected
detect_external_monitor() {
    local monitor_dump
    monitor_dump=$(hyprctl monitors)

    if grep -q "DP-7" <<<"$monitor_dump"; then
        echo "DP-7"
    elif grep -q "DP-8" <<<"$monitor_dump"; then
        # Dock occasionally exposes the BenQ as DP-8
        echo "DP-8"
    elif grep -q "DP-1" <<<"$monitor_dump"; then
        echo "DP-1"
    else
        echo ""
    fi
}

configure_home_layout() {
    local connector="$1"
    # Keep the 4K BenQ anchored at origin and push the laptop panel to the right
    hyprctl keyword monitor "$connector,3840x2160@60,0x0,1.666667"
    hyprctl keyword monitor "eDP-1,1920x1200@60.00100,2304x0,1"
}

configure_work_layout() {
    hyprctl keyword monitor "DP-1,2560x1440@59.95100,0x0,1"
    hyprctl keyword monitor "eDP-1,1920x1200@60.00100,2560x0,1"
}

case "${1:-}" in
    close)
        # When lid closes disable the internal panel so workspaces stay on the external
        hyprctl keyword monitor "eDP-1,disable"
        ;;
    open)
        external_monitor=$(detect_external_monitor)

        case "$external_monitor" in
            DP-7|DP-8)
                # Home office: BenQ 4K monitor with 1.666667x scaling
                configure_home_layout "$external_monitor"
                target_monitor="$external_monitor"
                ;;
            DP-1)
                # Work office: Dell 1440p monitor with 1x scaling
                configure_work_layout
                target_monitor="$external_monitor"
                ;;
            *)
                # No external monitor detected, just enable internal monitor
                hyprctl keyword monitor "eDP-1,1920x1200@60.00100,0x0,1"
                target_monitor=""
                ;;
        esac

        if [ -n "${target_monitor}" ]; then
            # Keep focus on external monitor to prevent workspace disruption
            sleep 0.1
            hyprctl focusmonitor "$target_monitor"
        fi
        ;;
    *)
        echo "Usage: $0 {open|close}" >&2
        exit 1
        ;;
esac
