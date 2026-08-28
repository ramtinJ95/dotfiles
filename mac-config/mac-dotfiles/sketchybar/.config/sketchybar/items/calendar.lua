local settings = require("settings")
local colors = require("colors")

local week_preview_seconds = 4
local show_week_until = 0
local compact_calendar = false
local external_display_check = [[system_profiler SPDisplaysDataType -json | /usr/bin/python3 -c 'import json,sys; data=json.load(sys.stdin); displays=[d for g in data.get("SPDisplaysDataType", []) for d in g.get("spdisplays_ndrvs", [])]; has_external=any(d.get("spdisplays_online") == "spdisplays_yes" and d.get("spdisplays_connection_type") != "spdisplays_internal" for d in displays); print("center" if has_external else "right")']]

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
  local format = compact_calendar and "%a %d %b %H:%M" or "%a %d %b  %H:%M"
  cal:set({ label = os.date(format) })
end

local function update_calendar_position()
  sbar.exec(external_display_check, function(position)
    local next_position = position and position:gsub("%s+", "") or "right"
    if next_position ~= "center" then next_position = "right" end
    local compact = next_position == "right"
    compact_calendar = compact
    cal:set({
      position = next_position,
      padding_left = compact and 6 or 8,
      padding_right = compact and 2 or 8,
      label = {
        padding_left = compact and 1 or 3,
        padding_right = compact and 1 or 3,
      },
    })
    if os.time() >= show_week_until then show_clock() end
  end)
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

cal:subscribe({ "display_change", "system_woke", "forced" }, update_calendar_position)

update_calendar_position()
