return {
  "MeanderingProgrammer/render-markdown.nvim",
  dependencies = { "nvim-treesitter/nvim-treesitter", "nvim-tree/nvim-web-devicons" }, -- if you prefer nvim-web-devicons
  ---@module 'render-markdown'
  ---@type render.md.UserConfig
  opts = {
    file_types = { "markdown", "vimwiki" },
  },
  config = function(_, opts)
    -- Register markdown as the parser for vimwiki files
    vim.treesitter.language.register("markdown", "vimwiki")
    -- Setup the plugin with the provided options
    require("render-markdown").setup(opts)
  end,
}
