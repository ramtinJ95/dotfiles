# Arch Linux Dotfiles

This directory contains the Arch Linux-specific GNU Stow packages. Shared
packages live in `../../common-config/common-dotfiles` and are installed first.

## Structure

Each directory represents a separate Arch-specific package that can be managed
independently:

- `bash/` - Bash configuration (.bashrc, .blerc)
- `ble/` - ble.sh (Bash Line Editor)
- `claude/` - Claude Code config, commands, hooks, and skills
- `codex/` - Codex AGENTS, prompts, and custom agent role definitions
- `ghostty/` - Ghostty terminal configuration
- `hypr/` - Hyprland window manager configuration
- `k9s/` - k9s Kubernetes terminal UI configuration
- `nvim/` - Neovim configuration
- `omarchy/` - Omarchy hooks and Waybar profiles
- `scripts/` - Arch helper scripts
- `starship/` - Starship prompt configuration
- `tlp/` - TLP power management configuration (system-wide)
- `tmux/` - tmux terminal multiplexer configuration
- `waybar/` - Waybar status bar configuration
- `yazi/` - Yazi file manager configuration

## Usage

Run these commands from the repository root.

```bash
# Validate package lists, Stow dry-runs, symlinks, shell, and JSON
scripts/dotfiles doctor

# Install shared and Arch user-level packages
scripts/dotfiles stow arch

# Install Arch system-level packages
sudo scripts/dotfiles stow arch-system

# Restow after package moves or config updates
scripts/dotfiles restow arch
sudo scripts/dotfiles restow arch-system
```

Use raw Stow for one-off package work:

```bash
# Install or remove one package
stow -d arch-config/arch-dotfiles -t "$HOME" hypr
stow -D -d common-config/common-dotfiles -t "$HOME" pi

# Simulate installation
stow -n -d arch-config/arch-dotfiles -t "$HOME" hypr
```

## Omarchy Waybar Theme Hooks

The `omarchy/` package installs a `theme-set` hook that swaps Waybar profiles
when Omarchy themes change:

- `Lavender` uses the saved custom Lavender Waybar profile
- `Purple Dream` uses the saved custom Purple Dream Waybar profile
- all other themes use a larger, theme-reactive stock-style Waybar profile
- every profile uses the Arch logo in the top-left Waybar menu button

On a new Omarchy machine, set this up in this order:

```bash
# 1. Clone this repo and enter it
cd ~/dotfiles

# 2. Install shared and Arch user-level dotfiles, including the omarchy package
scripts/dotfiles stow arch

# 3. Install optional themes used by the hook
omarchy theme install https://github.com/hembramnishant50-glitch/omarchy-lavender-theme.git
omarchy theme install https://github.com/ramtinJ95/purple-dream.git

# 4. Apply a theme; this triggers ~/.config/omarchy/hooks/theme-set.d/waybar-profile
omarchy theme set "Batou"

# 5. If the current theme was already set before stowing, run the hook manually
omarchy-hook theme-set "$(cat ~/.config/omarchy/current/theme.name)"
```

The hook copies profile files into `~/.config/waybar/` at runtime and restarts
Waybar only when something changed. It removes existing Waybar config symlinks
before copying, so it will not overwrite files inside this dotfiles repository.
If a later `scripts/dotfiles restow arch` reports conflicts for
`~/.config/waybar/{config.jsonc,style.css,colors.css}`, remove those generated
files and rerun `scripts/dotfiles restow arch`, then reapply the current theme
hook.

## Notes

- The `tlp/` package contains system-wide configuration and uses `packages/arch-system.txt`
- All other packages will create symlinks in your `~/.config/` or home directory
- The `codex/` package uses `.stow-local-ignore` so stow only links `~/.codex/AGENTS.md`, `~/.codex/agents/`, `~/.codex/agents_config.toml`, and `~/.codex/prompts/`; keep `~/.codex/config.toml`, `~/.codex/skills`, and runtime/state files local for now
- Make sure to backup your existing configurations before using stow
