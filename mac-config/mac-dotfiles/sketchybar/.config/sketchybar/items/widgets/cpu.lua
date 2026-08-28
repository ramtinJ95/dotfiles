local colors = require("colors")
local settings = require("settings")

-- Publish CPU load every two seconds without putting a graph in the bar.
sbar.exec("killall cpu_load >/dev/null; $CONFIG_DIR/helpers/event_providers/cpu_load/bin/cpu_load cpu_update 2.0")

local metric_font = {
  family = settings.font.numbers,
  style = settings.font.style_map["Bold"],
  size = 10.0,
}

local cpu = sbar.add("item", "widgets.cpu", {
  position = "right",
  padding_left = 2,
  padding_right = 2,
  icon = { drawing = false },
  label = {
    string = "cpu ??%",
    color = colors.grey,
    font = metric_font,
    width = 54,
    align = "left",
    padding_left = 0,
    padding_right = 0,
  },
})

local memory = sbar.add("item", "widgets.memory", {
  position = "right",
  update_freq = 5,
  padding_left = 2,
  padding_right = 2,
  icon = { drawing = false },
  label = {
    string = "mem ??%",
    color = colors.grey,
    font = metric_font,
    width = 54,
    align = "left",
    padding_left = 0,
    padding_right = 0,
  },
})

local function cpu_color(load)
  if load >= 80 then return colors.red end
  if load >= 60 then return colors.orange end
  if load >= 30 then return colors.yellow end
  return colors.blue
end

local function memory_color(load)
  if load >= 85 then return colors.red end
  if load >= 70 then return colors.orange end
  if load >= 50 then return colors.yellow end
  return colors.blue
end

cpu:subscribe("cpu_update", function(env)
  local load = tonumber(env.total_load)
  if not load then return end
  local color = cpu_color(load)
  cpu:set({
    label = { string = string.format("cpu %02d%%", load), color = color },
  })
end)

cpu:subscribe("mouse.clicked", function()
  sbar.exec("open -a 'Activity Monitor'")
end)

memory:subscribe({ "routine", "forced", "system_woke" }, function()
  sbar.exec("memory_pressure", function(memory_info)
    local free = memory_info:match("System%-wide memory free percentage:%s*(%d+)%%")
    if not free then return end
    local used = 100 - tonumber(free)
    local color = memory_color(used)
    memory:set({
      label = { string = string.format("mem %02d%%", used), color = color },
    })
  end)
end)

memory:subscribe("mouse.clicked", function()
  sbar.exec("open -a 'Activity Monitor'")
end)

sbar.add("item", "widgets.cpu.padding", {
  position = "right",
  width = settings.group_paddings,
})
