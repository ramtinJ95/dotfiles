# Dotfiles

Personal dotfiles and system configurations for macOS and Arch Linux, managed with [GNU Stow](https://www.gnu.org/software/stow/). Features a Catppuccin Mocha color scheme across all applications.

## 🖥️ Platforms

### macOS
Automated setup with Homebrew package management, system preferences, and dotfiles installation.

**Quick Start:**
```bash
cd mac-config/mac-install
./install.sh
```

See [mac-config/mac-install/README.md](mac-config/mac-install/README.md) for detailed setup instructions.

### Arch Linux
Modular dotfiles managed with GNU Stow for Hyprland-based desktop environment.

**Quick Start:**
```bash
cd arch-config/arch-dotfiles
stow */  # Install all configurations
```

See [arch-config/arch-dotfiles/README.md](arch-config/arch-dotfiles/README.md) for detailed usage.

## 📦 What's Included

### Shared Configurations
- **Neovim** - LazyVim-based configuration
- **Git** - Global config and aliases
- **Tmux** - Terminal multiplexer
- **Yazi** - Terminal file manager (Catppuccin theme)
- **Starship** - Cross-shell prompt
- **Bat** - Cat replacement with syntax highlighting

### macOS Specific
- **Yabai + skhd** - Tiling window manager and hotkeys
- **Alacritty** - Terminal emulator
- **Sketchybar** - Custom status bar
- **Spicetify** - Spotify theming
- **Zsh** - Shell configuration

### Arch Linux Specific
- **Hyprland** - Wayland compositor
- **Bash + ble.sh** - Enhanced bash with line editor
- **TLP** - Power management
- **Hypridle/Hyprlock** - Idle management and screen locking

## 🎨 Theme

All configurations use the **Catppuccin Mocha** color scheme for a consistent look across applications. Wallpapers are included in the `wallpapers/` directory.

## 🛠️ Manual Stow Commands

```bash
# macOS - Install specific package
cd mac-config/mac-dotfiles
stow -t ~ nvim

# macOS - Install all packages
stow -t ~ */

# Arch - Install specific packages
cd arch-config/arch-dotfiles
stow hypr nvim bash

# Remove a package
stow -D nvim
```

## 📁 Repository Structure

```
dotfiles/
├── mac-config/
│   ├── mac-install/        # Automated setup scripts
│   └── mac-dotfiles/       # Stow packages for macOS
├── arch-config/
│   └── arch-dotfiles/      # Stow packages for Arch Linux
├── wallpapers/             # Catppuccin-themed wallpapers
├── legacy-nvim-config/     # Backup of previous Neovim setup
└── piantor_keymap.json     # Custom keyboard layout
```

## 🚀 Getting Started

1. **Clone the repository:**
   ```bash
   git clone <your-repo-url> ~/workspace/dotfiles
   cd ~/workspace/dotfiles
   ```

2. **Choose your platform:**
   - **macOS**: Follow [mac-config/mac-install/README.md](mac-config/mac-install/README.md)
   - **Arch Linux**: Follow [arch-config/arch-dotfiles/README.md](arch-config/arch-dotfiles/README.md)

3. **Customize** the configurations to match your preferences

## ⚠️ Important Notes

- **Backup your existing configurations** before installing
- Some macOS preferences require logout/restart to take effect
- Arch TLP configuration requires sudo to install system files
- Review scripts before running automated installers

## 📝 License

Personal configurations - feel free to use and modify as needed.