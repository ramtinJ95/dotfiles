return {
  dir = vim.fn.stdpath("config"),
  name = "dbt-lsp-manual",
  config = function()
    local client = vim.lsp.start_client({
      name = "dbt-lsp",
      cmd = { "/home/ramtinj/personal-workspace/dbt-lsp/main" },
    })

    if not client then
      vim.notify("hey, you fked up the client thing")
      return
    end

    vim.api.nvim_create_autocmd("FileType", {
      pattern = "markdown",
      callback = function()
        vim.lsp.buf_attach_client(0, client)
      end,
    })
  end,
}
