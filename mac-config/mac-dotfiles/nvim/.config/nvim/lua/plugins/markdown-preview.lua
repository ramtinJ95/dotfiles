return {
  {
    "iamcco/markdown-preview.nvim",
    init = function()
      vim.g.mkdp_filetypes = { "markdown", "vimwiki" }
      vim.g.mkdp_theme = "dark"
      vim.g.mkdp_highlight_css = vim.fn.expand("~/.config/nvim/assets/catppuccin-mocha-highlight.css")
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
