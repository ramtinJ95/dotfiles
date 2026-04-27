# Dotfiles

Personal dotfiles and system configurations for macOS and Arch Linux, managed with [GNU Stow](https://www.gnu.org/software/stow/). Features a Catppuccin Mocha color scheme across all applications.

## Platforms

### macOS
Automated setup with Homebrew package management, system preferences, and dotfiles installation.

**Quick Start:**
```bash
cd mac-config/mac-install
./install.sh
```

See [mac-config/mac-install/README.md](mac-config/mac-install/README.md) for detailed setup instructions.

### Arch Linux
Modular dotfiles managed with GNU Stow for a Hyprland-based desktop environment.

**Quick Start:**
```bash
stow -d common-config/common-dotfiles -t "$HOME" $(cat packages/common.txt)
stow -d arch-config/arch-dotfiles -t "$HOME" $(cat packages/arch.txt)
```

See [arch-config/arch-dotfiles/README.md](arch-config/arch-dotfiles/README.md) for detailed usage.

## What's Included

### Shared Configurations
- **Agents** - User-level `.agents/skills` tree
- **Pi** - Pi agent configuration, extensions, and skills

### macOS Specific
- **Yabai + skhd** - Tiling window manager and hotkeys
- **Kitty** - Terminal emulator
- **Sketchybar** - Custom status bar
- **Spicetify** - Spotify theming
- **Zsh** - Shell configuration
- **Bat, btop, eza** - macOS CLI tool configuration

### Arch Linux Specific
- **Hyprland** - Wayland compositor
- **Bash + ble.sh** - Enhanced bash with line editor
- **TLP** - Power management
- **Hypridle/Hyprlock** - Idle management and screen locking
- **Ghostty, k9s, Waybar** - Arch desktop and terminal tooling

### Platform Packages With Similar Names

Some packages exist in both platform trees but are not shared yet because their
files still differ by operating system. That includes `claude`, `codex`, `git`,
`kitty`, `nvim`, `starship`, `tmux`, and `yazi`.

## Theme

All configurations use the **Catppuccin Mocha** color scheme for a consistent look across applications. Wallpapers are included in the `wallpapers/` directory.

## Stow Commands

Run these commands from the repository root.

```bash
# Shared packages for every machine
stow -d common-config/common-dotfiles -t "$HOME" $(cat packages/common.txt)

# macOS user packages
stow -d mac-config/mac-dotfiles -t "$HOME" $(cat packages/mac.txt)

# Arch user packages
stow -d arch-config/arch-dotfiles -t "$HOME" $(cat packages/arch.txt)

# Arch system packages
sudo stow -d arch-config/arch-dotfiles -t / $(cat packages/arch-system.txt)

# Install one package
stow -d mac-config/mac-dotfiles -t "$HOME" nvim

# Remove a package
stow -D -d common-config/common-dotfiles -t "$HOME" pi
```

If this machine already used the old platform-local `agents` and `pi` packages,
remove stale managed links before stowing from the new shared root. This keeps
Pi runtime files such as `auth.json`, `sessions/`, and `git/` in place.

```bash
for path in \
  "$HOME/.agents/skills" \
  "$HOME/.agents/.skill-lock.json" \
  "$HOME/.pi/agent/agents" \
  "$HOME/.pi/agent/extensions" \
  "$HOME/.pi/agent/keybindings.json" \
  "$HOME/.pi/agent/settings.json" \
  "$HOME/.pi/agent/skills"
do
  [[ -L "$path" ]] && rm "$path"
done

cmp -s "$HOME/.pi/agent/AGENTS.md" common-config/common-dotfiles/pi/.pi/agent/AGENTS.md \
  && rm "$HOME/.pi/agent/AGENTS.md"

stow -R -d common-config/common-dotfiles -t "$HOME" $(cat packages/common.txt)
stow -R -d mac-config/mac-dotfiles -t "$HOME" $(cat packages/mac.txt)
```

Use `arch-config/arch-dotfiles` and `packages/arch.txt` instead of the macOS
paths on Arch Linux.

## Repository Structure

```
dotfiles/
├── common-config/
│   └── common-dotfiles/    # Shared Stow packages
├── mac-config/
│   ├── mac-install/        # Automated setup scripts
│   └── mac-dotfiles/       # Stow packages for macOS
├── arch-config/
│   └── arch-dotfiles/      # Stow packages for Arch Linux
├── packages/               # Explicit package lists for Stow commands
├── wallpapers/             # Catppuccin-themed wallpapers
├── legacy-nvim-config/     # Backup of previous Neovim setup
└── piantor_keymap.json     # Custom keyboard layout
```

## Getting Started

1. **Clone the repository:**
   ```bash
   git clone <your-repo-url> ~/workspace/dotfiles
   cd ~/workspace/dotfiles
   ```

2. **Choose your platform:**
   - **macOS**: Follow [mac-config/mac-install/README.md](mac-config/mac-install/README.md)
   - **Arch Linux**: Follow [arch-config/arch-dotfiles/README.md](arch-config/arch-dotfiles/README.md)

3. **Customize** the configurations to match your preferences

## Important Notes

- **Backup your existing configurations** before installing
- Some macOS preferences require logout/restart to take effect
- Arch TLP configuration requires sudo to install system files
- Review scripts before running automated installers

## License

Personal configurations - feel free to use and modify as needed.
