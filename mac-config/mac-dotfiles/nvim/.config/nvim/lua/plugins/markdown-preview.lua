return {
  {
    "iamcco/markdown-preview.nvim",
    init = function()
      vim.g.mkdp_filetypes = { "markdown", "vimwiki" }
    end,
    keys = {
      {
        "<leader>cp",
        "<cmd>MarkdownPreviewToggle<cr>",
        ft = { "markdown", "vimwiki" },
        desc = "Markdown Preview",
      },
    },
  },
}
