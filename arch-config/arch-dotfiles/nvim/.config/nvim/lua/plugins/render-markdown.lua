return {
  "MeanderingProgrammer/render-markdown.nvim",
  dependencies = { "nvim-treesitter/nvim-treesitter", "nvim-tree/nvim-web-devicons" },
  ---@module 'render-markdown'
  ---@type render.md.UserConfig
  opts = {
    file_types = { "markdown", "vimwiki" },
    render_modes = { "n", "c" },
    anti_conceal = {
      enabled = false,
    },
  },
  config = function(_, opts)
    vim.treesitter.language.register("markdown", "vimwiki")
    require("render-markdown").setup(opts)
  end,
}
