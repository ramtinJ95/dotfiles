-- Autocmds are automatically loaded on the VeryLazy event
-- Default autocmds that are always set: https://github.com/LazyVim/LazyVim/blob/main/lua/lazyvim/config/autocmds.lua
--
-- Add any additional autocmds here
-- with `vim.api.nvim_create_autocmd`
--
-- Or remove existing autocmds by their group name (which is prefixed with `lazyvim_` for the defaults)
-- e.g. vim.api.nvim_del_augroup_by_name("lazyvim_wrap_spell")

local md_line_length = vim.api.nvim_create_augroup("md_line_length", { clear = true })

-- tuido task lines keep all their metadata (due date, priority, …) on the
-- task line itself; hard-wrapping silently demotes fields to prose. Todo
-- files get visual-only soft wrap instead of textwidth.
local todo_root = vim.fn.expand("~/personal/todo")

vim.api.nvim_create_autocmd("FileType", {
  group = md_line_length,
  pattern = "markdown",
  callback = function(ev)
    local path = vim.fn.fnamemodify(vim.api.nvim_buf_get_name(ev.buf), ":p")
    if vim.startswith(path, todo_root .. "/") then
      vim.opt_local.wrap = true
      vim.opt_local.linebreak = true
      vim.opt_local.breakindent = true
      return
    end
    vim.opt_local.textwidth = 80
    vim.opt_local.formatoptions:append("t")
  end,
})

-- Expand tuido shorthand (:p2, :due monday, …) into the emoji dialect on save
-- by filtering the buffer through `tuido fmt -`. BufWritePre keeps it in the
-- same undo step as the save; a nonzero exit (e.g. conflict markers) leaves
-- the buffer untouched.
local tuido_fmt = vim.api.nvim_create_augroup("tuido_fmt", { clear = true })

vim.api.nvim_create_autocmd("BufWritePre", {
  group = tuido_fmt,
  pattern = "*.md",
  callback = function(ev)
    local path = vim.fn.fnamemodify(vim.api.nvim_buf_get_name(ev.buf), ":p")
    if not vim.startswith(path, todo_root .. "/") then
      return
    end
    if vim.fn.executable("tuido") == 0 then
      return
    end
    local lines = vim.api.nvim_buf_get_lines(ev.buf, 0, -1, false)
    local res = vim.system({ "tuido", "fmt", "-" },
      { stdin = table.concat(lines, "\n") .. "\n" }):wait()
    if res.code ~= 0 then
      vim.notify("tuido fmt: " .. vim.trim(res.stderr or ""), vim.log.levels.WARN)
      return
    end
    local out = vim.split(res.stdout, "\n")
    if out[#out] == "" then
      table.remove(out)
    end
    if not vim.deep_equal(out, lines) then
      vim.api.nvim_buf_set_lines(ev.buf, 0, -1, false, out)
    end
  end,
})

-- After the write lands, commit the file and push in the background, so edits
-- made in the editor sync like edits made through tuido commands. Fire and
-- forget: tuido never blocks the editor on the network.
vim.api.nvim_create_autocmd("BufWritePost", {
  group = tuido_fmt,
  pattern = "*.md",
  callback = function(ev)
    local path = vim.fn.fnamemodify(vim.api.nvim_buf_get_name(ev.buf), ":p")
    if not vim.startswith(path, todo_root .. "/") then
      return
    end
    if vim.fn.executable("tuido") == 0 then
      return
    end
    vim.system({ "tuido", "_commit", path })
  end,
})
