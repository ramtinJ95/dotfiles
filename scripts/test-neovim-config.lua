-- Run from any directory: nvim --headless -u NONE -i NONE -l scripts/test-neovim-config.lua
-- Uses installed Lazy/Vimwiki, but never starts Lazy, downloads plugins, or opens notes.
local repo = vim.fn.fnamemodify(debug.getinfo(1, "S").source:sub(2), ":p:h:h")
local root = repo .. "/mac-config/mac-dotfiles/nvim/.config/nvim"
local plugins = vim.fn.stdpath("data") .. "/lazy"
assert(vim.uv.fs_stat(plugins .. "/lazy.nvim"), "Test requires installed lazy.nvim")
assert(vim.uv.fs_stat(plugins .. "/vimwiki"), "Test requires installed Vimwiki")

local checks = 0
local function eq(expected, actual)
  assert(vim.deep_equal(expected, actual), vim.inspect({ expected = expected, actual = actual }))
  checks = checks + 1
end

-- A configuration test must not invoke bootstrap, network checks, or todo sync.
vim.fn.system = function() error("Unexpected subprocess in config test") end
vim.system = function() error("Unexpected subprocess in config test") end
for _, path in ipairs(vim.fn.globpath(root, "**/*.lua", false, true)) do
  assert(loadfile(path))
end

local lazy_options
package.loaded.lazy = { setup = function(options) lazy_options = options end }
dofile(root .. "/lua/config/lazy.lua")
eq({ enabled = true, notify = false }, lazy_options.checker)
eq({ "gzip", "tarPlugin", "tohtml", "tutor", "zipPlugin" }, lazy_options.performance.rtp.disabled_plugins)
eq(nil, lazy_options.spec[1].commit) -- Do not restore the removed LazyVim pin.

local specs = {}
eq(nil, vim.uv.fs_stat(root .. "/lua/plugins/editor.lua"))
for _, name in ipairs({ "lsp", "noice", "treesitter", "no-neck-pain", "vimwiki", "markdown-preview" }) do
  local module = dofile(root .. "/lua/plugins/" .. name .. ".lua")
  local entries = type(module[1]) == "string" and { module } or module
  for _, spec in ipairs(entries) do
    assert(not specs[spec[1]], "Duplicate plugin: " .. spec[1])
    specs[spec[1]] = spec
  end
end
eq(false, specs["neovim/nvim-lspconfig"].opts.inlay_hints.enabled)
eq(false, specs["folke/noice.nvim"].opts.lsp.progress.enabled)
eq("<leader>zz", specs["shortcuts/no-neck-pain.nvim"].keys[1][1])
eq("<cmd>NoNeckPain<cr>", specs["shortcuts/no-neck-pain.nvim"].keys[1][2])
eq("<leader>cp", specs["iamcco/markdown-preview.nvim"].keys[1][1])
eq({
  "lua", "python", "typescript", "vimdoc", "vim", "regex", "terraform",
  "hcl", "java", "c", "cpp", "rust", "sql", "dockerfile", "toml", "json",
  "go", "gitignore", "yaml", "make", "cmake", "markdown", "markdown_inline",
  "bash", "tsx", "css", "html",
}, specs["nvim-treesitter/nvim-treesitter"].opts.ensure_installed)

-- Exercise the real Vimwiki resolver with synthetic filenames, not private contents.
specs["vimwiki/vimwiki"].init()
local wiki_root = vim.fn.expand("~/personal/Mywiki/")
eq({ { path = wiki_root, syntax = "markdown", ext = ".md" } }, vim.g.vimwiki_list)
eq(0, vim.g.vimwiki_global_ext)
vim.opt.rtp:append(plugins .. "/vimwiki")
vim.fn["vimwiki#vars#init"]()
eq(0, vim.fn["vimwiki#base#find_wiki"](wiki_root .. "config-test.md"))
eq(-1, vim.fn["vimwiki#base#find_wiki"](vim.fn.expand("~/vimwiki/config-test.md")))
local link = vim.fn["vimwiki#base#resolve_link"]("target", wiki_root .. "config-test.md")
eq(wiki_root .. "target.md", link.filename)
eq(0, link.index)
link = vim.fn["vimwiki#base#resolve_link"]("../target#Section", wiki_root .. "nested/config-test.md")
eq(wiki_root .. "target.md", vim.fs.normalize(link.filename))
eq("Section", link.anchor)

-- Use unnamed, unsaved buffers; never execute BufWrite hooks against real files.
dofile(root .. "/lua/config/autocmds.lua")
local function buffer(path)
  local buf = vim.api.nvim_create_buf(false, true)
  vim.api.nvim_set_current_buf(buf)
  vim.api.nvim_buf_set_name(buf, vim.fn.expand(path))
  return buf
end
for _, project in ipairs({ "intric-helm", "intric-services" }) do
  local buf = buffer("~/workspace/intric-infrastructure/helm/" .. project .. "/values.schema.json")
  vim.b[buf].autoformat = true
  vim.api.nvim_exec_autocmds("BufReadPost", { buffer = buf })
  eq(false, vim.b[buf].autoformat)
end
local buf = buffer("~/workspace/other-project/values.schema.json")
vim.b[buf].autoformat = true
vim.api.nvim_exec_autocmds("BufReadPost", { buffer = buf })
eq(true, vim.b[buf].autoformat)

buffer("~/personal/config-test.md")
vim.bo.textwidth = 0
vim.bo.formatoptions = "cq"
vim.api.nvim_exec_autocmds("FileType", { pattern = "markdown" })
eq(80, vim.bo.textwidth)
eq(true, vim.bo.formatoptions:find("t", 1, true) ~= nil)
buffer("~/personal/todo/config-test.md")
vim.bo.textwidth = 80
vim.bo.formatoptions = "tcq"
vim.api.nvim_exec_autocmds("FileType", { pattern = "markdown" })
eq(0, vim.bo.textwidth)
eq(nil, vim.bo.formatoptions:find("[tc]"))
eq(true, vim.wo.wrap and vim.wo.linebreak and vim.wo.breakindent)

eq({ "Rasterization", "lakehouse", "rasterization" }, vim.fn.readfile(root .. "/spell/en.utf-8.add"))
assert(vim.uv.fs_stat(root .. "/spell/en.utf-8.add.spl"))
eq({ 'indent_type = "Spaces"', "indent_width = 2", "column_width = 120" }, vim.fn.readfile(root .. "/stylua.toml"))
eq(true, vim.json.decode(table.concat(vim.fn.readfile(root .. "/.neoconf.json"), "\n")).neoconf.plugins.lua_ls.enabled)
print(string.format("Neovim personal configuration: %d checks passed", checks))
