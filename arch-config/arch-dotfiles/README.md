# Arch Linux Dotfiles

This repository contains my Arch Linux configuration files organized for use with [GNU Stow](https://www.gnu.org/software/stow/).

## Structure

Each directory represents a separate "package" that can be managed independently:

- `bash/` - Bash configuration (.bashrc, .blerc)
- `ble/` - ble.sh (Bash Line Editor)
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
stow hypr nvim bash

# Remove configurations
stow -D hypr nvim

# Simulate installation (dry run)
stow -n hypr
```

## Notes

- The `tlp/` package contains system-wide configuration and requires sudo to stow to `/etc/`
- All other packages will create symlinks in your `~/.config/` or home directory
- Make sure to backup your existing configurations before using stow