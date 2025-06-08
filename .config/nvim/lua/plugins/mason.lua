return {
  -- Mason setup - load lazily when needed
  {
    "williamboman/mason.nvim",
    cmd = "Mason",
    config = function()
      require("mason").setup()
    end,
  },

  -- Mason LSP config - load when LSP is needed
  {
    "williamboman/mason-lspconfig.nvim",
    dependencies = { 
      "williamboman/mason.nvim",
      "hrsh7th/cmp-nvim-lsp", -- Ensure cmp is loaded before LSP setup
    },
    event = { "BufReadPre", "BufNewFile" },
    config = function()
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
                      -- Optimized library loading - only load what's needed
                      library = vim.api.nvim_get_runtime_file("", true),
                    },
                    diagnostics = { 
                      disable = { "missing-fields" },
                      globals = { "vim" },
                    },
                    format = {
                      enable = false,
                    },
                  },
                },
              },
            }

            local server_config = servers[server_name] or {}
            local capabilities = vim.lsp.protocol.make_client_capabilities()
            
            -- Safely extend capabilities with cmp if available
            local has_cmp, cmp_nvim_lsp = pcall(require, "cmp_nvim_lsp")
            if has_cmp then
              capabilities = vim.tbl_deep_extend(
                "force",
                capabilities,
                cmp_nvim_lsp.default_capabilities()
              )
            end
            
            server_config.capabilities =
                vim.tbl_deep_extend("force", {}, capabilities, server_config.capabilities or {})
            require("lspconfig")[server_name].setup(server_config)
          end,
        },
      })
    end,
  },

  -- Mason tool installer - load only when Mason command is used
  {
    "WhoIsSethDaniel/mason-tool-installer.nvim",
    dependencies = { "williamboman/mason.nvim" },
    cmd = { "Mason", "MasonToolsInstall", "MasonToolsUpdate" },
    config = function()
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
        auto_update = false, -- Don't auto-update on startup
        run_on_start = false, -- Don't run installation check on startup
      })
    end,
  },

  -- Mason null-ls - load when formatting is needed
  {
    "jayp0521/mason-null-ls.nvim",
    dependencies = { "williamboman/mason.nvim" },
    event = { "BufReadPre", "BufNewFile" },
    config = function()
      require("mason-null-ls").setup({
        ensure_installed = {
          "prettier", -- ts/js formatter
          "stylua", -- lua formatter
          "eslint_d", -- ts/js linter
          "shfmt", -- Shell formatter
          "checkmake", -- linter for Makefiles
          "ruff", -- Python linter and formatter
        },
        automatic_installation = false, -- Don't install on every startup
      })
    end,
  },
}

