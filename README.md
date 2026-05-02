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
scripts/dotfiles doctor
scripts/dotfiles stow arch
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

## Helper Commands

Run these commands from the repository root.

```bash
# Validate package lists, clean Stow dry-runs, symlinks, shell, and JSON
scripts/dotfiles doctor

# Install user-level dotfiles
scripts/dotfiles stow mac
scripts/dotfiles stow arch

# Restow after package moves or config updates
scripts/dotfiles restow mac
scripts/dotfiles restow arch

# Install Arch system packages
sudo scripts/dotfiles stow arch-system
sudo scripts/dotfiles restow arch-system
```

Use raw Stow for one-off package work:

```bash
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

scripts/dotfiles restow mac
```

Use `scripts/dotfiles restow arch` instead on Arch Linux.

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
   git clone git@github.com:ramtinJ95/dotfiles.git ~/workspace/dotfiles
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
