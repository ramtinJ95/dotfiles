local settings = require("settings")
local colors = require("colors")

local week_preview_seconds = 4
local show_week_until = 0

-- Padding item required because of bracket
sbar.add("item", { position = "center", width = settings.group_paddings })

local cal = sbar.add("item", {
  icon = {
    color = colors.white,
    padding_left = 8,
    font = {
      style = settings.font.style_map["Black"],
      size = 12.0,
    },
  },
  label = {
    color = colors.white,
    padding_right = 8,
    width = 49,
    align = "right",
    font = { family = settings.font.numbers },
  },
  position = "center",
  update_freq = 30,
  padding_left = 1,
  padding_right = 1,
  background = {
    color = colors.bg1,
    border_color = colors.grey,
    border_width = 1
  },
})

-- Double border for calendar using a single item bracket
sbar.add("bracket", { cal.name }, {
  background = {
    color = colors.transparent,
    height = 30,
    border_color = colors.grey,
  }
})

-- Padding item required because of bracket
sbar.add("item", { position = "center", width = settings.group_paddings })

cal:subscribe({ "forced", "routine", "system_woke" }, function(env)
  if os.time() < show_week_until then
    cal:set({ icon = "Week", label = os.date("%V") })
    return
  end

  cal:set({ icon = os.date("%a. %d %b."), label = os.date("%H:%M") })
end)

cal:subscribe("mouse.clicked", function()
  show_week_until = os.time() + week_preview_seconds
  cal:set({ icon = "Week", label = os.date("%V") })
  sbar.delay(week_preview_seconds, function()
    if os.time() >= show_week_until then
      cal:set({ icon = os.date("%a. %d %b."), label = os.date("%H:%M") })
    end
  end)
end)
