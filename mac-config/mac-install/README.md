# Mac Setup Automation

Automated setup scripts to quickly reproduce your development environment on a new Mac.

## What This Does

- ✅ Installs Xcode Command Line Tools
- ✅ Installs Homebrew and all your packages
- ✅ Sets up dotfiles using GNU Stow
- ✅ Applies your macOS system preferences
- ✅ Configures shell environment

## Files

- `install.sh` - Main installation script
- `Brewfile` - Homebrew packages list
- `set-defaults.sh` - macOS system preferences

## Quick Start

On a **new Mac**:

```bash
# 1. Clone your dotfiles
git clone <your-dotfiles-repo> ~/workspace/dotfiles

# 2. Run the setup
cd ~/workspace/dotfiles/mac-config/mac-install
./install.sh
```

## Manual Steps (if needed)

If you want to run parts separately:

```bash
# Install Homebrew packages only
brew bundle install

# Apply macOS defaults only  
./set-defaults.sh

# Stow dotfiles only
cd ../mac-dotfiles
stow -t ~ */
```

## Updating Your Setup

When you install new packages or change settings:

```bash
# Update Brewfile with new packages
brew bundle dump --describe --file=Brewfile --force

# Update macOS defaults (edit set-defaults.sh manually)
```

## What Gets Configured

### Homebrew Packages
- Development tools (git, node, neovim, etc.)
- CLI utilities (fzf, ripgrep, etc.) 
- GUI applications via casks
- Fonts and other resources

### macOS Preferences
- Dock: autohide enabled, no launch animations
- Keyboard: fast key repeat (2ms repeat, 25ms delay)
- Finder: show status bar, path bar, disable extension warnings
- Screenshots: PNG format, no shadows
- Trackpad: tap to click enabled

### Dotfiles
- Zsh configuration with plugins
- Git configuration
- Terminal tools (btop, eza, starship, etc.)
- Window management (yabai, skhd)
- Editor configs (neovim, etc.)

## Troubleshooting

- If Xcode tools installation hangs, restart and run again
- Some changes require logout/restart to take effect
- Run `brew doctor` after setup to check for issues
- Make sure your dotfiles repo structure matches the expected paths