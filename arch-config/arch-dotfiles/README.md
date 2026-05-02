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

## Notes

- The `tlp/` package contains system-wide configuration and uses `packages/arch-system.txt`
- All other packages will create symlinks in your `~/.config/` or home directory
- The `codex/` package uses `.stow-local-ignore` so stow only links `~/.codex/AGENTS.md`, `~/.codex/agents/`, `~/.codex/agents_config.toml`, and `~/.codex/prompts/`; keep `~/.codex/config.toml`, `~/.codex/skills`, and runtime/state files local for now
- Make sure to backup your existing configurations before using stow
