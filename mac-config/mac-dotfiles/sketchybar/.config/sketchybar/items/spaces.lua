local colors = require("colors")
local settings = require("settings")

local spaces = {}
local selected_spaces = {}
local occupied_spaces = {}
local sync_in_progress = false
local sync_requested = false

local spaces_anchor = sbar.add("item", "spaces.anchor", { drawing = false })

local function update_space_style(space_index)
  local color = colors.grey
  if selected_spaces[space_index] then
    color = colors.red
  elseif occupied_spaces[space_index] then
    color = colors.white
  end

  local space = spaces[space_index]
  if space then space:set({ icon = { color = color } }) end
end

local function order_space_items(space_indices)
  if #space_indices == 0 then return end
  local command = "sketchybar"
  for _, space_index in ipairs(space_indices) do
    command = command .. " --move space." .. space_index .. " before " .. spaces_anchor.name
  end
  sbar.exec(command)
end

local function set_space_drawing(space_index, should_draw)
  local space = spaces[space_index]
  if space then space:set({ drawing = should_draw, space = space_index }) end
end

local function create_space(space_index)
  local space = sbar.add("space", "space." .. space_index, {
    space = space_index,
    drawing = true,
    width = 24,
    padding_left = 0,
    padding_right = 0,
    icon = {
      string = tostring(space_index),
      color = colors.grey,
      padding_left = 0,
      padding_right = 0,
      font = {
        family = settings.font.numbers,
        style = settings.font.style_map["Semibold"],
        size = 13.0,
      },
    },
    label = { drawing = false },
  })

  spaces[space_index] = space

  space:subscribe("space_change", function(env)
    selected_spaces[space_index] = env.SELECTED == "true"
    update_space_style(space_index)
  end)

  space:subscribe("mouse.clicked", function(env)
    if env.BUTTON == "left" then
      sbar.exec("yabai -m space --focus " .. env.SID)
    end
  end)
end

local function refresh_occupancy()
  sbar.exec("yabai -m query --windows", function(windows)
    if type(windows) ~= "table" then return end
    occupied_spaces = {}
    for _, window in ipairs(windows) do
      local space_index = tonumber(window.space)
      if space_index then occupied_spaces[space_index] = true end
    end
    for space_index, _ in pairs(spaces) do update_space_style(space_index) end
  end)
end

local function sync_spaces()
  if sync_in_progress then
    sync_requested = true
    return
  end

  sync_in_progress = true
  sbar.exec("yabai -m query --spaces", function(yabai_spaces)
    if type(yabai_spaces) == "table" then
      local active_spaces = {}
      local active_space_indices = {}

      for _, yabai_space in ipairs(yabai_spaces) do
        local space_index = tonumber(yabai_space.index)
        if space_index then
          active_spaces[space_index] = true
          selected_spaces[space_index] = yabai_space["has-focus"] == true
          table.insert(active_space_indices, space_index)
          if not spaces[space_index] then create_space(space_index) end
          set_space_drawing(space_index, true)
          update_space_style(space_index)
        end
      end

      table.sort(active_space_indices)
      order_space_items(active_space_indices)
      for space_index, _ in pairs(spaces) do
        if not active_spaces[space_index] then set_space_drawing(space_index, false) end
      end
      refresh_occupancy()
    end

    sync_in_progress = false
    if sync_requested then
      sync_requested = false
      sync_spaces()
    end
  end)
end

local space_observer = sbar.add("item", "space.observer", {
  drawing = false,
  updates = true,
  update_freq = 15,
})

space_observer:subscribe("space_windows_change", function(env)
  local space_index = tonumber(env.INFO.space)
  if not space_index or not spaces[space_index] then
    sync_spaces()
    return
  end
  occupied_spaces[space_index] = next(env.INFO.apps) ~= nil
  update_space_style(space_index)
end)

space_observer:subscribe({ "display_change", "space_change", "system_woke", "forced", "routine" }, function(env)
  sync_spaces()
  if env.SENDER == "display_change" or env.SENDER == "system_woke" then
    sbar.exec("sleep 1", sync_spaces)
  end
end)

sync_spaces()
