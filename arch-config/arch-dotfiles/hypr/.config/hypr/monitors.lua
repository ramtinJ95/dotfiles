-- See https://wiki.hypr.land/Configuring/Basics/Monitors/
-- List current monitors and supported resolutions with: hyprctl monitors all

-- The 14" 1920x1200 panel runs at native 1x; Omarchy's "auto" picks 1.5.
hl.env("GDK_SCALE", "1")

-- Keep the laptop panel as the source display.
hl.monitor({ output = "eDP-1", mode = "1920x1200@60.00100", position = "0x0", scale = 1 })

-- Mirror any otherwise-unmatched external display to the laptop panel.
hl.monitor({ output = "", mode = "preferred", position = "auto", scale = 1, mirror = "eDP-1" })
