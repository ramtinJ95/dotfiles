local M = {}
local state = {}

local root = vim.fn.expand("~/.config/macarchy")
local current_path = vim.fn.stdpath("config") .. "/lua/macarchy/current.lua"
local runtime_names = {
  ["catppuccin-mocha"] = "catppuccin-mocha",
  ["kanagawa-wave"] = "kanagawa",
  ["tokyonight-night"] = "tokyonight-night",
}

local function read_current()
  local chunk, load_error = loadfile(current_path)
  if not chunk then
    error(load_error)
  end

  local ok, theme = pcall(chunk)
  if not ok then
    error(theme)
  end
  if
    type(theme) ~= "table"
    or type(theme.generation_id) ~= "string"
    or type(theme.theme_id) ~= "string"
    or not runtime_names[theme.colorscheme]
  then
    error("invalid generated Neovim theme")
  end
  return theme
end

function M.current()
  local ok, theme = pcall(read_current)
  if not ok then
    error("Macarchy: " .. theme)
  end
  return theme
end

function M.verify()
  local theme = M.current()
  if not state.watcher then
    error("Macarchy: canonical theme watcher is not active")
  end
  if vim.g.colors_name ~= runtime_names[theme.colorscheme] then
    error(
      "Macarchy: active colorscheme is "
        .. tostring(vim.g.colors_name)
        .. "; expected "
        .. runtime_names[theme.colorscheme]
    )
  end
  return theme
end

local function apply_current()
  local ok, theme = pcall(read_current)
  if not ok then
    vim.notify("Macarchy: " .. theme, vim.log.levels.ERROR)
    return
  end
  if state.generation_id == theme.generation_id then
    return
  end

  local applied, apply_error = pcall(vim.cmd.colorscheme, theme.colorscheme)
  if not applied then
    vim.notify("Macarchy: " .. apply_error, vim.log.levels.ERROR)
    return
  end
  state.generation_id = theme.generation_id
end

function M.watch()
  if state.watcher then
    return M.current()
  end

  local watcher = vim.uv.new_fs_event()
  local timer = vim.uv.new_timer()
  local started, start_error = watcher:start(root, {}, function(watch_error)
    if watch_error then
      vim.schedule(function()
        vim.notify("Macarchy: canonical theme watcher failed: " .. watch_error, vim.log.levels.ERROR)
      end)
      return
    end
    timer:stop()
    timer:start(50, 0, vim.schedule_wrap(apply_current))
  end)
  if not started then
    watcher:close()
    timer:close()
    error("Macarchy: cannot watch canonical theme state: " .. start_error)
  end

  state.watcher = watcher
  local read_ok, current = pcall(M.current)
  if not read_ok then
    watcher:stop()
    watcher:close()
    timer:close()
    state.watcher = nil
    error(current)
  end
  state.generation_id = current.generation_id
  vim.api.nvim_create_autocmd("VimResume", { callback = apply_current })
  vim.api.nvim_create_autocmd("VimLeavePre", {
    once = true,
    callback = function()
      watcher:stop()
      timer:stop()
      watcher:close()
      timer:close()
    end,
  })
  return current
end

return M
