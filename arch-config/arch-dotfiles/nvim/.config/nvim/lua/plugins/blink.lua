return {
  "saghen/blink.cmp",
  opts = {
    keymap = {
      preset = "enter",
      ["<CR>"] = { "fallback" },
      ["<C-y>"] = { "accept", "fallback" },
    },
  },
}