local settings = require("settings")
local colors = require("colors")

local week_preview_seconds = 4
local show_week_until = 0

local cal = sbar.add("item", "calendar.clock", {
  position = "center",
  update_freq = 30,
  padding_left = 8,
  padding_right = 8,
  icon = { drawing = false },
  label = {
    color = colors.white,
    padding_left = 3,
    padding_right = 3,
    align = "center",
    font = {
      family = settings.font.numbers,
      style = settings.font.style_map["Semibold"],
      size = 13.0,
    },
  },
})

local function show_clock()
  cal:set({ label = os.date("%a %d %b  %H:%M") })
end

cal:subscribe({ "forced", "routine", "system_woke" }, function()
  if os.time() < show_week_until then
    cal:set({ label = "Week " .. os.date("%V") })
  else
    show_clock()
  end
end)

cal:subscribe("mouse.clicked", function()
  show_week_until = os.time() + week_preview_seconds
  cal:set({ label = "Week " .. os.date("%V") })
  sbar.delay(week_preview_seconds, function()
    if os.time() >= show_week_until then show_clock() end
  end)
end)
