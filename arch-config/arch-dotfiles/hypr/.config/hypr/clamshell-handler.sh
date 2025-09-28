#!/bin/bash

# Script to handle clamshell mode properly with workspace management

if [ "$1" = "close" ]; then
    # When lid closes - disable internal monitor (workspaces automatically move to external)
    hyprctl keyword monitor "eDP-1,disable"
    
elif [ "$1" = "open" ]; then
    # When lid opens - enable internal monitor positioned to the right (accounting for 4K scaling)
    # 3840/1.666667 = 2304, so position internal monitor at 2304 pixels to the right
    hyprctl keyword monitor "eDP-1,1920x1200@60.00100,2304x0,1"
    
    # Keep focus on external monitor to prevent workspace disruption
    sleep 0.1
    hyprctl focusmonitor DP-7
fi