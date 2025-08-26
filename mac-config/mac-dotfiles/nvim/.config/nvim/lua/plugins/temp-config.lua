return {
  {
    "akinsho/bufferline.nvim",
    -- TODO: Remove this once https://github.com/LazyVim/LazyVim/pull/6354 is merged
    init = function()
      local bufline = require("catppuccin.groups.integrations.bufferline")
      bufline.get = bufline.get_theme
    end,
    ---@module 'bufferline'
    ---@type bufferline.Config
    opts = {
      options = {
        always_show_bufferline = true,
        separator_style = "thick",
        hover = {
          enabled = true,
          delay = 120,
          reveal = { "close" },
        },
      },
    },
  },
}
