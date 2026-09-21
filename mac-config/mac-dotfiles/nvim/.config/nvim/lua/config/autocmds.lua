-- Preserve hand-maintained schema formatting in the infrastructure repository.
local infrastructure_root = vim.fs.normalize(vim.fn.expand("~/workspace/intric-infrastructure"))
local manual_format_files = {
  [infrastructure_root .. "/helm/intric-helm/values.schema.json"] = true,
  [infrastructure_root .. "/helm/intric-services/values.schema.json"] = true,
}

local function preserve_manual_formatting(buf)
  if manual_format_files[vim.fs.normalize(vim.api.nvim_buf_get_name(buf))] then
    vim.b[buf].autoformat = false
  end
end

vim.api.nvim_create_autocmd({ "BufReadPost", "BufNewFile", "BufEnter" }, {
  group = vim.api.nvim_create_augroup("manual_json_format", { clear = true }),
  pattern = "values.schema.json",
  callback = function(ev)
    preserve_manual_formatting(ev.buf)
  end,
})
preserve_manual_formatting(0)

-- Keep todo shorthand expansion and syncing local to the todo tree.
local todo_root = vim.fn.expand("~/personal/todo") .. "/"
local group = vim.api.nvim_create_augroup("tuido_fmt", { clear = true })

local function is_todo(buf)
  return vim.startswith(vim.fn.fnamemodify(vim.api.nvim_buf_get_name(buf), ":p"), todo_root)
end

vim.api.nvim_create_autocmd("FileType", {
  group = group,
  pattern = "markdown",
  callback = function(ev)
    if not is_todo(ev.buf) then
      vim.bo[ev.buf].textwidth = 80
      vim.opt_local.formatoptions:append("t")
      return
    end
    -- Metadata must stay on its task line; wrap visually, never in the file.
    vim.bo[ev.buf].textwidth = 0
    vim.bo[ev.buf].formatoptions = vim.bo[ev.buf].formatoptions:gsub("[tc]", "")
    vim.opt_local.wrap = true
    vim.opt_local.linebreak = true
    vim.opt_local.breakindent = true
  end,
})

vim.api.nvim_create_autocmd("BufWritePre", {
  group = group,
  pattern = "*.md",
  callback = function(ev)
    if not is_todo(ev.buf) then
      return
    end
    if vim.fn.executable("tuido") == 0 then
      vim.notify("tuido fmt: executable missing from PATH; saving without expansion", vim.log.levels.ERROR)
      return
    end
    local lines = vim.api.nvim_buf_get_lines(ev.buf, 0, -1, false)
    local res = vim.system({ "tuido", "fmt", "-" }, {
      stdin = table.concat(lines, "\n") .. "\n",
    }):wait()
    if res.code ~= 0 then
      vim.notify("tuido fmt: " .. vim.trim(res.stderr or "") .. "; saving without expansion", vim.log.levels.ERROR)
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

vim.api.nvim_create_autocmd("BufWritePost", {
  group = group,
  pattern = "*.md",
  callback = function(ev)
    if not is_todo(ev.buf) then
      return
    end
    vim.system({ "tuido", "_commit", vim.api.nvim_buf_get_name(ev.buf) }, {}, function(res)
      if res.code ~= 0 then
        vim.schedule(function()
          vim.notify("tuido _commit: " .. vim.trim(res.stderr or ""), vim.log.levels.ERROR)
        end)
      end
    end)
  end,
})
