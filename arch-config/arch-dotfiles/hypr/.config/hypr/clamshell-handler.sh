#!/bin/bash

# Script to handle clamshell mode properly with workspace management

# Detect which external monitor is connected
detect_external_monitor() {
    if hyprctl monitors | grep -q "DP-7"; then
        echo "DP-7"
    elif hyprctl monitors | grep -q "DP-1"; then
        echo "DP-1"
    else
        echo ""
    fi
}

if [ "$1" = "close" ]; then
    # When lid closes - disable internal monitor (workspaces automatically move to external)
    hyprctl keyword monitor "eDP-1,disable"
    
elif [ "$1" = "open" ]; then
    external_monitor=$(detect_external_monitor)
    
    if [ "$external_monitor" = "DP-7" ]; then
        # Home office: BenQ 4K monitor with 1.666667x scaling
        # 3840/1.666667 = 2304, so position internal monitor at 2304 pixels to the right
        hyprctl keyword monitor "eDP-1,1920x1200@60.00100,2304x0,1"
        
        # Keep focus on external monitor to prevent workspace disruption
        sleep 0.1
        hyprctl focusmonitor DP-7
        
    elif [ "$external_monitor" = "DP-1" ]; then
        # Work office: Dell 1440p monitor with 1x scaling
        # 2560x1 = 2560, so position internal monitor at 2560 pixels to the right
        hyprctl keyword monitor "eDP-1,1920x1200@60.00100,2560x0,1"
        
        # Keep focus on external monitor to prevent workspace disruption
        sleep 0.1
        hyprctl focusmonitor DP-1
    else
        # No external monitor detected, just enable internal monitor
        hyprctl keyword monitor "eDP-1,1920x1200@60.00100,0x0,1"
    fi
fi