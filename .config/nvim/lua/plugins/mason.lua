return {
  -- Mason setup - load this early but safely
  {
    "williamboman/mason.nvim",
    cmd = "Mason",
    event = "VimEnter", -- Load earlier than before
    config = function()
      require("mason").setup()
    end,
  },

  -- Mason LSP config - load after Mason but still early
  {
    "williamboman/mason-lspconfig.nvim",
    dependencies = { "williamboman/mason.nvim" },
    event = "VimEnter",
    config = function()
      -- Shorter delay since we're loading earlier
      vim.defer_fn(function()
        require("mason-lspconfig").setup({
          ensure_installed = {},
          automatic_installation = false,
          handlers = {
            -- Setup servers automatically when Mason installs them
            function(server_name)
              local servers = {
                clangd = {},
                rust_analyzer = {},
                ruff = {},
                pylsp = {
                  settings = {
                    pylsp = {
                      plugins = {
                        pyflakes = { enabled = false },
                        pycodestyle = { enabled = false },
                        autopep8 = { enabled = false },
                        yapf = { enabled = false },
                        mccabe = { enabled = false },
                        pylsp_mypy = { enabled = false },
                        pylsp_black = { enabled = false },
                        pylsp_isort = { enabled = false },
                      },
                    },
                  },
                },
                dockerls = {},
                sqlls = {},
                terraformls = {},
                jsonls = {},
                yamlls = {},
                lua_ls = {
                  settings = {
                    Lua = {
                      completion = {
                        callSnippet = "Replace",
                      },
                      runtime = { version = "LuaJIT" },
                      workspace = {
                        checkThirdParty = false,
                        library = {
                          "${3rd}/luv/library",
                          unpack(vim.api.nvim_get_runtime_file("", true)),
                        },
                      },
                      diagnostics = { disable = { "missing-fields" } },
                      format = {
                        enable = false,
                      },
                    },
                  },
                },
              }

              local server_config = servers[server_name] or {}
              local capabilities = vim.lsp.protocol.make_client_capabilities()
              capabilities = vim.tbl_deep_extend(
                "force",
                capabilities,
                require("cmp_nvim_lsp").default_capabilities()
              )
              server_config.capabilities =
                  vim.tbl_deep_extend("force", {}, capabilities, server_config.capabilities or {})
              require("lspconfig")[server_name].setup(server_config)
            end,
          },
        })
      end, 50) -- Shorter delay
    end,
  },

  -- Mason tool installer - load early to install tools quickly
  {
    "WhoIsSethDaniel/mason-tool-installer.nvim",
    dependencies = { "williamboman/mason.nvim" },
    event = "VimEnter",
    config = function()
      vim.defer_fn(function()
        local ensure_installed = {
          "stylua", -- Used to format Lua code
          "clangd",
          "rust_analyzer",
          "ruff",
          "pylsp",
          "dockerls",
          "sqlls",
          "terraformls",
          "jsonls",
          "yamlls",
          "lua_ls",
        }
        require("mason-tool-installer").setup({
          ensure_installed = ensure_installed,
        })
      end, 100) -- Shorter delay
    end,
  },

  -- Mason null-ls - load early for formatting
  {
    "jayp0521/mason-null-ls.nvim",
    dependencies = { "williamboman/mason.nvim" },
    event = "VimEnter",
    config = function()
      vim.defer_fn(function()
        require("mason-null-ls").setup({
          ensure_installed = {
            "prettier", -- ts/js formatter
            "stylua", -- lua formatter
            "eslint_d", -- ts/js linter
            "shfmt", -- Shell formatter
            "checkmake", -- linter for Makefiles
            "ruff", -- Python linter and formatter
          },
          automatic_installation = true,
        })
      end, 150) -- Shorter delay
    end,
  },
}

