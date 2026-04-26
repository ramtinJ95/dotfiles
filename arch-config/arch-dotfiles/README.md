# Arch Linux Dotfiles

This repository contains my Arch Linux configuration files organized for use with [GNU Stow](https://www.gnu.org/software/stow/).

## Structure

Each directory represents a separate "package" that can be managed independently:

- `agents/` - Shared user-level `.agents/skills` tree for Codex and other agent harnesses
- `bash/` - Bash configuration (.bashrc, .blerc)
- `ble/` - ble.sh (Bash Line Editor)
- `claude/` - Claude Code config, commands, hooks, and skills
- `codex/` - Codex AGENTS, prompts, and custom agent role definitions
- `hypr/` - Hyprland window manager configuration
- `nvim/` - Neovim configuration
- `spicetify/` - Spotify theming configuration
- `starship/` - Starship prompt configuration
- `tlp/` - TLP power management configuration (system-wide)
- `tmux/` - tmux terminal multiplexer configuration
- `yazi/` - Yazi file manager configuration

## Usage

To install configurations using GNU Stow:

```bash
# Install all configurations
stow */

# Install specific configurations
stow bash claude codex agents hypr nvim

# Remove configurations
stow -D codex agents hypr nvim

# Simulate installation (dry run)
stow -n codex agents
```

## Notes

- The `tlp/` package contains system-wide configuration and requires sudo to stow to `/etc/`
- All other packages will create symlinks in your `~/.config/` or home directory
- The `codex/` package uses `.stow-local-ignore` so stow only links `~/.codex/AGENTS.md`, `~/.codex/agents/`, `~/.codex/agents_config.toml`, and `~/.codex/prompts/`; keep `~/.codex/config.toml`, `~/.codex/skills`, and runtime/state files local for now
- Make sure to backup your existing configurations before using stow
