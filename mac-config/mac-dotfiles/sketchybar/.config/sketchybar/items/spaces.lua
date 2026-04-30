local colors = require("colors")
local icons = require("icons")
local settings = require("settings")
local app_icons = require("helpers.app_icons")

local spaces = {}
local space_brackets = {}
local space_paddings = {}
local space_popups = {}
local sync_in_progress = false
local sync_requested = false

local function icon_line_for_apps(apps)
	local icon_line = ""
	local no_app = true

	for _, app in ipairs(apps) do
		no_app = false
		local lookup = app_icons[app]
		local icon = ((lookup == nil) and app_icons["Default"] or lookup)
		icon_line = icon_line .. icon
	end

	if no_app then
		icon_line = " —"
	end

	return icon_line
end

local function refresh_space_labels()
	sbar.exec("yabai -m query --windows", function(windows)
		if type(windows) ~= "table" then
			return
		end

		local apps_by_space = {}
		local seen_apps_by_space = {}

		for _, window in ipairs(windows) do
			local space_index = tonumber(window.space)
			local app = window.app

			if space_index ~= nil and app ~= nil and app ~= "" then
				apps_by_space[space_index] = apps_by_space[space_index] or {}
				seen_apps_by_space[space_index] = seen_apps_by_space[space_index] or {}

				if not seen_apps_by_space[space_index][app] then
					table.insert(apps_by_space[space_index], app)
					seen_apps_by_space[space_index][app] = true
				end
			end
		end

		for space_index, space in pairs(spaces) do
			space:set({ label = icon_line_for_apps(apps_by_space[space_index] or {}) })
		end
	end)
end

local function order_space_items(space_indices)
	if #space_indices == 0 then
		return
	end

	local command = "sketchybar"
	for _, space_index in ipairs(space_indices) do
		command = command
			.. " --move space."
			.. space_index
			.. " before spaces_indicator --move space.padding."
			.. space_index
			.. " before spaces_indicator"
	end

	sbar.exec(command)
end

local function set_space_drawing(space_index, should_draw)
	if spaces[space_index] then
		spaces[space_index]:set({
			drawing = should_draw,
			space = space_index,
			popup = { drawing = false },
			background = { drawing = should_draw },
		})
	end

	if space_brackets[space_index] then
		space_brackets[space_index]:set({
			background = { drawing = should_draw },
		})
	end

	if space_paddings[space_index] then
		space_paddings[space_index]:set({
			drawing = should_draw,
			space = space_index,
		})
	end
end

local function create_space(space_index)
	local space = sbar.add("space", "space." .. space_index, {
		space = space_index,
		drawing = true,
		icon = {
			font = { family = settings.font.numbers },
			string = tostring(space_index),
			padding_left = 15,
			padding_right = 8,
			color = colors.white,
			highlight_color = colors.red,
		},
		label = {
			string = " —",
			padding_right = 20,
			color = colors.grey,
			highlight_color = colors.white,
			font = "sketchybar-app-font:Regular:16.0",
			y_offset = -1,
		},
		padding_right = 1,
		padding_left = 1,
		background = {
			drawing = true,
			color = colors.bg1,
			border_width = 1,
			height = 26,
			border_color = colors.black,
		},
		popup = { background = { border_width = 5, border_color = colors.black } },
	})

	spaces[space_index] = space

	local space_bracket = sbar.add("bracket", "space.bracket." .. space_index, { space.name }, {
		background = {
			drawing = true,
			color = colors.transparent,
			border_color = colors.bg2,
			height = 28,
			border_width = 2,
		},
	})
	space_brackets[space_index] = space_bracket

	space_paddings[space_index] = sbar.add("space", "space.padding." .. space_index, {
		space = space_index,
		script = "",
		width = settings.group_paddings,
	})

	local space_popup = sbar.add("item", "space.popup." .. space_index, {
		position = "popup." .. space.name,
		padding_left = 5,
		padding_right = 0,
		background = {
			drawing = true,
			image = {
				corner_radius = 9,
				scale = 0.2,
			},
		},
	})
	space_popups[space_index] = space_popup

	space:subscribe("space_change", function(env)
		local selected = env.SELECTED == "true"
		space:set({
			icon = { highlight = selected },
			label = { highlight = selected },
			background = { border_color = selected and colors.black or colors.bg2 },
		})
		space_bracket:set({
			background = { border_color = selected and colors.grey or colors.bg2 },
		})
	end)

	space:subscribe("mouse.clicked", function(env)
		if env.BUTTON == "other" then
			space_popup:set({ background = { image = "space." .. env.SID } })
			space:set({ popup = { drawing = "toggle" } })
		else
			local op = (env.BUTTON == "right") and "--destroy" or "--focus"
			sbar.exec("yabai -m space " .. op .. " " .. env.SID)
		end
	end)

	space:subscribe("mouse.exited", function(_)
		space:set({ popup = { drawing = false } })
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

				if space_index ~= nil then
					active_spaces[space_index] = true
					table.insert(active_space_indices, space_index)

					if not spaces[space_index] then
						create_space(space_index)
					end

					set_space_drawing(space_index, true)
				end
			end

			table.sort(active_space_indices)
			order_space_items(active_space_indices)

			for space_index, _ in pairs(spaces) do
				if not active_spaces[space_index] then
					set_space_drawing(space_index, false)
				end
			end

			refresh_space_labels()
		end

		sync_in_progress = false
		if sync_requested then
			sync_requested = false
			sync_spaces()
		end
	end)
end

local space_window_observer = sbar.add("item", "space_window_observer", {
	drawing = false,
	updates = true,
	update_freq = 15,
})

local spaces_indicator = sbar.add("item", "spaces_indicator", {
	padding_left = -3,
	padding_right = 0,
	icon = {
		padding_left = 8,
		padding_right = 9,
		color = colors.grey,
		string = icons.switch.on,
	},
	label = {
		width = 0,
		padding_left = 0,
		padding_right = 8,
		string = "Spaces",
		color = colors.bg1,
	},
	background = {
		color = colors.with_alpha(colors.grey, 0.0),
		border_color = colors.with_alpha(colors.bg1, 0.0),
	},
})

space_window_observer:subscribe("space_windows_change", function(env)
	local space_index = tonumber(env.INFO.space)
	local space = spaces[space_index]

	if not space then
		sync_spaces()
		return
	end

	local apps = {}
	for app, _ in pairs(env.INFO.apps) do
		table.insert(apps, app)
	end
	table.sort(apps)

	sbar.animate("tanh", 10, function()
		space:set({ label = icon_line_for_apps(apps) })
	end)
end)

space_window_observer:subscribe({ "display_change", "space_change", "system_woke", "forced", "routine" }, function(env)
	sync_spaces()

	if env.SENDER == "display_change" or env.SENDER == "system_woke" then
		sbar.exec("sleep 1", function()
			sync_spaces()
		end)
	end
end)

spaces_indicator:subscribe("swap_menus_and_spaces", function(_)
	local currently_on = spaces_indicator:query().icon.value == icons.switch.on
	spaces_indicator:set({
		icon = currently_on and icons.switch.off or icons.switch.on,
	})
end)

spaces_indicator:subscribe("mouse.entered", function(_)
	sbar.animate("tanh", 30, function()
		spaces_indicator:set({
			background = {
				color = { alpha = 1.0 },
				border_color = { alpha = 1.0 },
			},
			icon = { color = colors.bg1 },
			label = { width = "dynamic" },
		})
	end)
end)

spaces_indicator:subscribe("mouse.exited", function(_)
	sbar.animate("tanh", 30, function()
		spaces_indicator:set({
			background = {
				color = { alpha = 0.0 },
				border_color = { alpha = 0.0 },
			},
			icon = { color = colors.grey },
			label = { width = 0 },
		})
	end)
end)

spaces_indicator:subscribe("mouse.clicked", function(_)
	sbar.trigger("swap_menus_and_spaces")
end)

sync_spaces()
