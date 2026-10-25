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
- `omarchy/` - Omarchy shell config (`shell.json`) and the `theme-set` hook
- `scripts/` - Arch helper scripts
- `starship/` - Starship prompt configuration
- `tlp/` - TLP power management configuration (system-wide)
- `tmux/` - tmux terminal multiplexer configuration
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

## Omarchy quattro

These packages target Omarchy quattro (4.x): Hyprland is configured in Lua
(`hypr/*.lua`), and the Omarchy shell replaces Waybar, mako, walker, swayosd,
hypridle and hyprlock. The pre-quattro `.conf` files and Waybar profiles live
in git history.

`hypr/monitors.lua` pins the ThinkPad panel (`eDP-1`, 1920x1200 at 1x) and
mirrors external displays to it; adjust it on machines with a different panel.

A fresh Omarchy install writes its own copies of the files these packages own,
so Stow will report conflicts. Move Omarchy's copies aside, then stow:

```bash
cd ~/dotfiles
for f in hypr/{hyprland,bindings,input,looknfeel,monitors,autostart}.lua \
  hypr/.luarc.json hypr/hyprsunset.conf hypr/xdph.conf kitty/kitty.conf \
  ghostty/config tmux/tmux.conf xdg-terminals.list omarchy/shell.json; do
  [[ -e ~/.config/$f && ! -L ~/.config/$f ]] && mv ~/.config/$f ~/.config/$f.omarchy-default
done
scripts/dotfiles stow arch
hyprctl reload && hyprctl configerrors
omarchy-hook theme-set "$(cat ~/.local/state/omarchy/current/theme.name)"
```

The `theme-set` hook regenerates the kitty tab bar, tmux status line,
Starship palette and Yazi flavor from the active theme's `colors.toml`.

## Notes

- The `tlp/` package contains system-wide configuration and uses `packages/arch-system.txt`
- All other packages will create symlinks in your `~/.config/` or home directory
- The `codex/` package uses `.stow-local-ignore` so stow only links `~/.codex/AGENTS.md`, `~/.codex/agents/`, `~/.codex/agents_config.toml`, and `~/.codex/prompts/`; keep `~/.codex/config.toml`, `~/.codex/skills`, and runtime/state files local for now
- Make sure to backup your existing configurations before using stow
