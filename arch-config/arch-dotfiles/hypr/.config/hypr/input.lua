-- Keep only your personal input overrides here. Uncommented settings below
-- replace Omarchy's defaults.
-- See https://wiki.hypr.land/Configuring/Basics/Variables/#input

-- US + Swedish layouts, Caps Lock as Ctrl (replaces Omarchy's compose:caps).
hl.config({
  input = {
    kb_layout = "us,se",
    kb_options = "ctrl:nocaps",

    repeat_rate = 40,
    repeat_delay = 600,
    numlock_by_default = true,

    touchpad = {
      scroll_factor = 0.4,
    },
  },
})

-- Swap left Super and left Alt only on the built-in laptop keyboard.
hl.device({
  name = "at-translated-set-2-keyboard",
  kb_layout = "us,se",
  kb_options = "ctrl:nocaps,altwin:swap_lalt_lwin",
})

hl.device({ name = "logitech-mx-master-3s", sensitivity = -0.3 })

-- Cycle keyboard layout on every keyboard.
o.bind("ALT + SPACE", "Next keyboard layout", "hyprctl switchxkblayout all next")
