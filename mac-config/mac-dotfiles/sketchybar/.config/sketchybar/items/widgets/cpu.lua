local icons = require("icons")
local colors = require("colors")
local settings = require("settings")

-- Execute the event provider binary which provides the event "cpu_update" for
-- the cpu load data, which is fired every 2.0 seconds.
sbar.exec("killall cpu_load >/dev/null; $CONFIG_DIR/helpers/event_providers/cpu_load/bin/cpu_load cpu_update 2.0")

local cpu = sbar.add("graph", "widgets.cpu" , 42, {
  position = "right",
  graph = { color = colors.blue },
  background = {
    height = 22,
    color = { alpha = 0 },
    border_color = { alpha = 0 },
    drawing = true,
  },
  icon = { string = icons.cpu },
  label = {
    string = "cpu ??%",
    font = {
      family = settings.font.numbers,
      style = settings.font.style_map["Bold"],
      size = 9.0,
    },
    align = "right",
    padding_right = 0,
    width = 0,
    y_offset = 4
  },
  padding_right = settings.paddings + 6
})

local memory = sbar.add("item", "widgets.memory", {
  position = "right",
  update_freq = 5,
  icon = {
    string = "mem",
    padding_left = 4,
    font = {
      style = settings.font.style_map["Heavy"],
      size = 9.0,
    },
    padding_right = 2,
    y_offset = 5,
  },
  label = {
    string = "??%",
    font = {
      family = settings.font.numbers,
      style = settings.font.style_map["Bold"],
      size = 9.0,
    },
    align = "right",
    padding_right = 0,
    width = 0,
    y_offset = -5,
  },
  padding_left = 0,
  padding_right = 2,
})

cpu:subscribe("cpu_update", function(env)
  -- Also available: env.user_load, env.sys_load
  local load = tonumber(env.total_load)
  cpu:push({ load / 100. })

  local color = colors.blue
  if load > 30 then
    if load < 60 then
      color = colors.yellow
    elseif load < 80 then
      color = colors.orange
    else
      color = colors.red
    end
  end

  cpu:set({
    graph = { color = color },
    label = "cpu " .. env.total_load .. "%",
  })
end)

cpu:subscribe("mouse.clicked", function(env)
  sbar.exec("open -a 'Activity Monitor'")
end)

memory:subscribe({ "routine", "forced", "system_woke" }, function()
  sbar.exec("memory_pressure", function(memory_info)
    local free = memory_info:match("System%-wide memory free percentage:%s*(%d+)%%")
    if not free then return end

    local used = 100 - tonumber(free)
    local color = colors.blue
    if used > 50 then
      if used < 70 then
        color = colors.yellow
      elseif used < 85 then
        color = colors.orange
      else
        color = colors.red
      end
    end

    memory:set({
      icon = { color = color },
      label = {
        string = string.format("%02d%%", used),
        color = color,
      },
    })
  end)
end)

memory:subscribe("mouse.clicked", function()
  sbar.exec("open -a 'Activity Monitor'")
end)

-- Background around the cpu and memory items
sbar.add("bracket", "widgets.cpu.bracket", { cpu.name, memory.name }, {
  background = { color = colors.bg1 }
})

-- Background around the cpu item
sbar.add("item", "widgets.cpu.padding", {
  position = "right",
  width = settings.group_paddings
})
