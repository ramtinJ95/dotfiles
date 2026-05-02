local omarchy_theme = vim.fn.expand("~/.config/omarchy/current/theme/neovim.lua")

if vim.uv.fs_stat(omarchy_theme) then
  return dofile(omarchy_theme)
end

return {}
