-- See https://wiki.hypr.land/Configuring/Basics/Monitors/
-- List current monitors and supported resolutions with: hyprctl monitors all

-- The 14" 1920x1200 panel runs at native 1x; Omarchy's "auto" picks 1.5.
hl.env("GDK_SCALE", "1")

-- Laptop panel sits centered below the BenQ: x = (2400 - 1920) / 2, y = 1350.
-- If the BenQ scale changes, recompute: BenQ logical size = 3840x2160 / scale.
hl.monitor({ output = "eDP-1", mode = "1920x1200@60.00100", position = "240x1350", scale = 1.25 })

-- BenQ RD320UA 32" 4K: extended desktop above the laptop, native res.
-- Scale 1.6 gives a 2400x1350 logical workspace with crisp 4K rendering.
-- Note: Omarchy's scaling tool appends a DP-7 rule with position "auto",
-- which breaks this stacked layout; change scale here instead.
hl.monitor({ output = "desc:BNQ BenQ RD320UA 49R01047019", mode = "3840x2160@60", position = "0x0", scale = 1.6 })

-- Any other external display extends the desktop at its preferred mode.
hl.monitor({ output = "", mode = "preferred", position = "auto", scale = "auto" })
