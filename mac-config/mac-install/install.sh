#!/bin/bash

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "$SCRIPT_DIR/../.." && pwd)"
BREWFILE="$SCRIPT_DIR/Brewfile"
DOTFILES_HELPER="$REPO_ROOT/scripts/dotfiles"
SET_DEFAULTS="$SCRIPT_DIR/set-defaults.sh"

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Function to print colored output
print_status() {
    echo -e "${BLUE}→ $1${NC}"
}

print_success() {
    echo -e "${GREEN}✓ $1${NC}"
}

print_warning() {
    echo -e "${YELLOW}⚠ $1${NC}"
}

print_error() {
    echo -e "${RED}✗ $1${NC}"
}

load_homebrew_shellenv() {
    if [[ -x /opt/homebrew/bin/brew ]]; then
        eval "$(/opt/homebrew/bin/brew shellenv)"
    elif [[ -x /usr/local/bin/brew ]]; then
        eval "$(/usr/local/bin/brew shellenv)"
    fi
}

install_sbarlua() {
    local module="$HOME/.local/share/sketchybar_lua/sketchybar.so"

    if [[ -f "$module" ]]; then
        print_success "SbarLua already installed"
        return
    fi

    print_status "Installing SbarLua for Sketchybar Lua config..."
    local tmp_dir
    tmp_dir="$(mktemp -d)"
    git clone https://github.com/FelixKratz/SbarLua.git "$tmp_dir/SbarLua"
    make -C "$tmp_dir/SbarLua" install
    rm -rf "$tmp_dir"
}

# Check if we're on macOS
if [[ "$OSTYPE" != "darwin"* ]]; then
    print_error "This script is only for macOS!"
    exit 1
fi

echo -e "${BLUE}"
echo "╔══════════════════════════════════════════════════════════════╗"
echo "║                    Mac Setup Automation                     ║"
echo "║                                                              ║"
echo "║  This script will install and configure your complete       ║"
echo "║  development environment on a fresh Mac.                    ║"
echo "╚══════════════════════════════════════════════════════════════╝"
echo -e "${NC}"

# Ask for the administrator password upfront
sudo -v

# Keep-alive: update existing `sudo` time stamp until script has finished
while true; do sudo -n true; sleep 60; kill -0 "$$" || exit; done 2>/dev/null &
SUDO_KEEPALIVE_PID="$!"
trap 'kill "$SUDO_KEEPALIVE_PID" 2>/dev/null || true' EXIT

print_status "Starting Mac setup..."

# Step 1: Install Xcode Command Line Tools
print_status "Installing Xcode Command Line Tools..."
if xcode-select --print-path &> /dev/null; then
    print_success "Xcode Command Line Tools already installed"
else
    xcode-select --install
    print_warning "Please complete the Xcode Command Line Tools installation in the dialog, then press Enter to continue..."
    read -r
fi

# Step 2: Install Homebrew
print_status "Installing Homebrew..."
load_homebrew_shellenv

if command -v brew &> /dev/null; then
    print_success "Homebrew already installed"
    brew update
else
    /bin/bash -c "$(curl -fsSL https://raw.githubusercontent.com/Homebrew/install/HEAD/install.sh)"
fi

load_homebrew_shellenv

if ! command -v brew &> /dev/null; then
    print_error "Homebrew installed, but brew is not available on PATH"
    exit 1
fi

install_sbarlua

# Step 3: Install packages from Brewfile
print_status "Installing packages from Brewfile..."
if [[ -f "$BREWFILE" ]]; then
    brew bundle install --file="$BREWFILE"
    print_success "All packages installed successfully"
else
    print_error "Brewfile not found at $BREWFILE"
    exit 1
fi

# Step 4: Validate repository helper
if [[ ! -x "$DOTFILES_HELPER" ]]; then
    print_error "Dotfiles helper not found or not executable at $DOTFILES_HELPER"
    exit 1
fi

# Step 5: Stow dotfiles
print_status "Setting up dotfiles with Stow..."
"$DOTFILES_HELPER" doctor
"$DOTFILES_HELPER" stow mac

print_success "All dotfiles stowed successfully"

# Step 6: Apply macOS defaults
print_status "Applying macOS system preferences..."
if [[ -f "$SET_DEFAULTS" ]]; then
    "$SET_DEFAULTS"
    print_success "macOS defaults applied"
else
    print_warning "set-defaults.sh not found, skipping system preferences"
fi

# Step 7: Setup shell (if needed)
print_status "Configuring shell..."
if [[ "${SHELL:-}" != */zsh ]]; then
    chsh -s "$(command -v zsh)"
    print_success "Default shell changed to zsh"
else
    print_success "Zsh already set as default shell"
fi

# Step 8: Start macOS services
print_status "Starting macOS services..."
for service in skhd yabai sketchybar; do
    if brew services start "$service"; then
        print_success "$service service started"
    else
        print_warning "Could not start $service. Check macOS permissions and run: brew services start $service"
    fi
done

# Step 9: Final steps
print_status "Running final setup steps..."

# Reload shell configuration
if [[ -f "$HOME/.zshrc" ]]; then
    print_status "Reloading zsh configuration..."
fi

echo
print_success "🎉 Mac setup completed successfully!"
echo
echo -e "${YELLOW}Next steps:${NC}"
echo "  1. Restart your terminal or run: source ~/.zshrc"
echo "  2. Log out and log back in for all system preferences to take effect"
echo "  3. Configure any additional app-specific settings manually"
echo "  4. Run 'brew doctor' to check for any issues"
echo

print_status "Setup summary:"
echo "  • Xcode Command Line Tools: ✓"
echo "  • Homebrew + packages: ✓"
echo "  • Dotfiles (stow): ✓"
echo "  • macOS preferences: ✓"
echo "  • macOS services: ✓"
echo "  • Shell configuration: ✓"
