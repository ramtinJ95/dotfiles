local icons = require("icons")

sbar.add("item", "apple.menu", {
  icon = {
    font = { size = 14.0 },
    string = icons.apple,
    padding_right = 6,
    padding_left = 2,
  },
  label = { drawing = false },
  padding_left = 0,
  padding_right = 4,
  click_script = "$CONFIG_DIR/helpers/menus/bin/menus -s 0"
})
