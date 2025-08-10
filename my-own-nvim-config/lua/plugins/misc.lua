-- Standalone plugins with less than 10 lines of config go here
return {
	{
		"wakatime/vim-wakatime",
	},
	{
		"christoomey/vim-tmux-navigator",
	},
	{
		"tpope/vim-rhubarb",
	},
	{
		"numToStr/Comment.nvim",
	},
	{
		"shortcuts/no-neck-pain.nvim",
		vim.keymap.set("n", "<leader>cc", ":NoNeckPain<CR>"),
	},
	{
		-- Detect tabstop and shiftwidth automatically
		"tpope/vim-sleuth",
	},
	{
		-- Autoclose parentheses, brackets, quotes, etc.
		"windwp/nvim-autopairs",
		event = "InsertEnter",
		config = true,
		opts = {},
	},
	{
		-- Highlight todo, notes, etc in comments
		"folke/todo-comments.nvim",
		event = "VimEnter",
		dependencies = { "nvim-lua/plenary.nvim" },
		opts = { signs = false },
	},
	{
		"vimwiki/vimwiki",
		branch = "dev",
		init = function()
			vim.g.vimwiki_list = {
				{
					template_path = vim.fn.stdpath("data") .. "/site/pack/packer/start/vimwiki/autoload/",
					syntax = "markdown",
					ext = ".md",
					path = "~/workspace/Mywiki", -- does not work?=!?!?
				},
			}
			vim.g.vimwiki_global_ext = 0
		end,
	},
	{
		-- `lazydev` configures Lua LSP for your Neovim config, runtime and plugins
		-- used for completion, annotations and signatures of Neovim apis
		"folke/lazydev.nvim",
		ft = "lua",
		opts = {
			library = {
				-- Load luvit types when the `vim.uv` word is found
				{ path = "${3rd}/luv/library", words = { "vim%.uv" } },
			},
		},
	},
}
