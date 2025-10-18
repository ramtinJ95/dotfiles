return {
  {
    "vimwiki/vimwiki",
    lazy = false,
    init = function()
      vim.g.vimwiki_list = {
        {
          syntax = "markdown",
          ext = ".md",
          path = "~/personal-workspace/Mywiki",
        },
      }
      vim.g.vimwiki_global_ext = 0
    end,
  },
}
