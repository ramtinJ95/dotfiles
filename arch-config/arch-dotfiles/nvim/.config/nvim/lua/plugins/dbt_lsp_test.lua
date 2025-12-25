return {
  "neovim/nvim-lspconfig",
  opts = {
    servers = {
      ["dbt_lsp"] = {
        cmd = { "/home/ramtinj/personal-workspace/dbt-lsp/main" },
        filetypes = { "markdown" },
        root_dir = function(bufnr, on_dir)
          on_dir(vim.fn.getcwd())
        end,
      },
    },
    setup = {
      ["dbt_lsp"] = function(server, opts)
        vim.lsp.config(server, opts)
        vim.lsp.enable(server)
        return true
      end,
    },
  },
}
