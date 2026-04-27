# Mac Setup Automation

Automated setup scripts to quickly reproduce your development environment on a new Mac.

## What This Does

- Installs Xcode Command Line Tools
- Installs Homebrew and all your packages
- Sets up shared and macOS dotfiles using GNU Stow
- Applies your macOS system preferences
- Configures shell environment

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

# Stow shared and macOS dotfiles only, from the repo root
cd ~/workspace/dotfiles
stow -d common-config/common-dotfiles -t "$HOME" $(cat packages/common.txt)
stow -d mac-config/mac-dotfiles -t "$HOME" $(cat packages/mac.txt)

# Restow after package moves or config updates
stow -R -d common-config/common-dotfiles -t "$HOME" $(cat packages/common.txt)
stow -R -d mac-config/mac-dotfiles -t "$HOME" $(cat packages/mac.txt)
```

If the common Stow command reports conflicts on an existing machine, use the
existing-machine migration section in the root `README.md` first. Fresh machines
do not need that step.

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
- Shared agent configuration from `common-config/common-dotfiles`
- Zsh configuration
- Git configuration
- Terminal tools (btop, eza, starship, etc.)
- Window management (yabai, skhd)
- Editor configs (neovim, etc.)

## Package Lists

The install script reads package names from the repository-level `packages/`
directory:

- `packages/common.txt` - shared packages installed on every machine
- `packages/mac.txt` - macOS user-level packages

Add new package names to the right list when creating a new Stow package.

## Troubleshooting

- If Xcode tools installation hangs, restart and run again
- Some changes require logout/restart to take effect
- Run `brew doctor` after setup to check for issues
- Make sure your dotfiles repo structure matches the expected paths
