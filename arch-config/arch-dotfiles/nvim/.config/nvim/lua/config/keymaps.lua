-- Keymaps are automatically loaded on the VeryLazy event
-- Default keymaps that are always set: https://github.com/LazyVim/LazyVim/blob/main/lua/lazyvim/config/keymaps.lua
-- Add any additional keymaps here
vim.api.nvim_set_keymap("i", "jk", "<Esc>", { noremap = false })

-- Copy into void register
vim.keymap.set("n", "<leader>y", '"+y')
vim.keymap.set("v", "<leader>y", '"+y')
vim.keymap.set("n", "<leader>Y", '"+Y')

-- delete single character without copying into register
vim.keymap.set("n", "x", '"_x', opts)

-- Vertical scroll and center
vim.keymap.set("n", "<C-d>", "<C-d>zz", opts)
vim.keymap.set("n", "<C-u>", "<C-u>zz", opts)

-- Find and center
vim.keymap.set("n", "n", "nzzzv", opts)
vim.keymap.set("n", "N", "Nzzzv", opts)

local md_line_length = vim.api.nvim_create_augroup("md_line_length", { clear = true })
vim.api.nvim_create_autocmd({ "BufRead", "BufNewFile" }, {
  command = "setlocal textwidth=80",
  group = md_line_length,
  pattern = "*.md",
})

-- Blink.cmp keybindings - change accept from Enter to Ctrl+y
vim.keymap.set("i", "<C-y>", function()
  require("blink.cmp").accept()
end, { desc = "Accept completion" })

-- Global Copilot toggle state
local copilot_enabled = true

vim.keymap.set("n", "<leader>ax", function()
  if copilot_enabled then
    vim.cmd("Copilot disable")
    copilot_enabled = false
    print("Copilot disabled globally")
  else
    vim.cmd("Copilot enable")
    copilot_enabled = true
    print("Copilot enabled globally")
  end
end, { desc = "Toggle Copilot globally" })
