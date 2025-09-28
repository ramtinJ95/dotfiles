#!/bin/bash

# Script to handle clamshell mode properly with workspace management

if [ "$1" = "close" ]; then
    # When lid closes - disable internal monitor (workspaces automatically move to external)
    hyprctl keyword monitor "eDP-1,disable"
    
elif [ "$1" = "open" ]; then
    # When lid opens - enable internal monitor positioned to the right
    hyprctl keyword monitor "eDP-1,1920x1200@60.00100,5760x0,1"
    
    # Keep focus on external monitor to prevent workspace disruption
    sleep 0.1
    hyprctl focusmonitor DP-7
fi