-- Keep only your personal keybinding overrides here. Add new bindings or
-- unbind defaults before replacing them.

-- See current bindings and descriptions:
--   omarchy menu keybindings --print

-- Drop Omarchy defaults I don't use or rebind below.
for _, key in ipairs({
  "N", "G", "O", "SLASH", "B", "M", "D", "A", "E", "S", "T", "L",
}) do
  hl.unbind("SUPER + " .. key)
end

for _, key in ipairs({
  "N", "G", "O", "SLASH", "M", "D", "E", "X", "F", "S", "B", "C", "L",
}) do
  hl.unbind("SUPER + SHIFT + " .. key)
end

for _, key in ipairs({ "B", "A", "G", "X" }) do
  hl.unbind("SUPER + SHIFT + ALT + " .. key)
end

-- Applications
o.bind("SUPER + M", "Music", { webapp = "https://open.spotify.com", focus = true })
o.bind("SUPER + T", "Activity", { tui = "btop" })
o.bind("SUPER + D", "Discord", { webapp = "https://discord.com/channels/@me", focus = true })
o.bind("SUPER + G", "Github", { webapp = "https://github.com/", focus = true })
o.bind("SUPER + S", "Slack", { webapp = "https://app.slack.com/client/T04CAJ1RK/C04CAJ1RT", focus = true })
o.bind("SUPER + N", "File manager", { omarchy = "nautilus" })
o.bind("SUPER + SHIFT + B", "Browser", { omarchy = "browser" })
o.bind("SUPER + A", "Focus Terminal", hl.dsp.focus({ window = "class:^(kitty)$" }))
o.bind("SUPER + B", "Focus Browser", hl.dsp.focus({ window = "class:^(chromium)$" }))
o.bind("SUPER + SHIFT + F", "Fullscreen", hl.dsp.window.fullscreen({ mode = "maximized" }))

-- Window focus navigation with Alt+HJKL
o.bind("ALT + H", "Focus left", hl.dsp.focus({ direction = "l" }))
o.bind("ALT + J", "Focus down", hl.dsp.focus({ direction = "d" }))
o.bind("ALT + K", "Focus up", hl.dsp.focus({ direction = "u" }))
o.bind("ALT + L", "Focus right", hl.dsp.focus({ direction = "r" }))

-- Window movement with Alt+Ctrl+HJKL
o.bind("ALT + CTRL + H", "Move window left", hl.dsp.window.move({ direction = "l" }))
o.bind("ALT + CTRL + J", "Move window down", hl.dsp.window.move({ direction = "d" }))
o.bind("ALT + CTRL + K", "Move window up", hl.dsp.window.move({ direction = "u" }))
o.bind("ALT + CTRL + L", "Move window right", hl.dsp.window.move({ direction = "r" }))

-- macOS-style screenshot binding
o.bind("ALT + SHIFT + 4", "Screenshot region (macOS style)", "omarchy-capture-screenshot region")

-- Dygma Defy currently sends Alt+Backspace for this physical key.
-- Treat it as plain Backspace everywhere so tap/hold delete one character at a time.
o.bind("ALT + BACKSPACE", nil, hl.dsp.send_shortcut({ mods = "", key = "BackSpace", window = "activewindow" }))

-- Lock and suspend
o.bind("SUPER + SHIFT + L", "Lock screen", "omarchy-system-lock")
o.bind("SUPER + SHIFT + ALT + L", "Suspend", "systemctl suspend")
