-- Require the sketchybar module
sbar = require("sketchybar")

-- Set the bar name, if you are using another bar instance than sketchybar
-- sbar.set_bar_name("bottom_bar")

-- Bundle the entire initial configuration into a single message to sketchybar
sbar.begin_config()
require("bar")
require("default")
require("items")
sbar.add("item", "macarchy.theme.ready", { drawing = false })
sbar.end_config()

-- Coordinate with the native (auto-hidden, Liquid Glass transparent) menu bar:
-- hide sketchybar when the cursor reaches the top so the native bar reveals
-- cleanly, then slide it back. See malpern/sketchybar-toggle.
sbar.exec("pkill -x sketchybar-toggle; sketchybar-toggle &")

-- Run the event loop of the sketchybar module (without this there will be no
-- callback functions executed in the lua module)
sbar.event_loop()
