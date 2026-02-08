local settings = require("settings")
local colors = require("colors")

local week_preview_seconds = 4
local show_week_until = 0
local external_display_check = [[system_profiler SPDisplaysDataType -json | /usr/bin/python3 -c 'import json,sys; data=json.load(sys.stdin); displays=[d for g in data.get("SPDisplaysDataType", []) for d in g.get("spdisplays_ndrvs", [])]; has_external=any(d.get("spdisplays_online") == "spdisplays_yes" and d.get("spdisplays_connection_type") != "spdisplays_internal" for d in displays); print("center" if has_external else "right")']]

-- Padding item required because of bracket
local cal_padding_left = sbar.add("item", "calendar.padding.left", {
  position = "center",
  width = settings.group_paddings
})

local cal = sbar.add("item", "calendar.clock", {
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
local cal_bracket = sbar.add("bracket", "calendar.bracket", { cal.name }, {
  background = {
    color = colors.transparent,
    height = 30,
    border_color = colors.grey,
  }
})

-- Padding item required because of bracket
local cal_padding_right = sbar.add("item", "calendar.padding.right", {
  position = "center",
  width = settings.group_paddings
})

local function set_calendar_position(position)
  cal_padding_left:set({ position = position })
  cal:set({ position = position })
  cal_bracket:set({ position = position })
  cal_padding_right:set({ position = position })
end

local function update_calendar_position()
  sbar.exec(external_display_check, function(position)
    local next_position = position and position:gsub("%s+", "") or "right"
    if next_position ~= "center" then
      next_position = "right"
    end
    set_calendar_position(next_position)
  end)
end

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

cal:subscribe({ "display_change", "system_woke", "forced" }, function()
  update_calendar_position()
end)

update_calendar_position()
