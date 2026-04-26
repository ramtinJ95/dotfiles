#!/bin/bash

set -e

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
if command -v brew &> /dev/null; then
    print_success "Homebrew already installed"
    brew update
else
    /bin/bash -c "$(curl -fsSL https://raw.githubusercontent.com/Homebrew/install/HEAD/install.sh)"
    
    # Add Homebrew to PATH for Apple Silicon Macs
    if [[ $(uname -m) == "arm64" ]]; then
        echo 'eval "$(/opt/homebrew/bin/brew shellenv)"' >> ~/.zprofile
        eval "$(/opt/homebrew/bin/brew shellenv)"
    fi
fi

# Step 3: Install packages from Brewfile
print_status "Installing packages from Brewfile..."
if [[ -f "Brewfile" ]]; then
    brew bundle install
    print_success "All packages installed successfully"
else
    print_error "Brewfile not found in current directory!"
    exit 1
fi

# Step 4: Clone dotfiles if not already present
DOTFILES_DIR="$HOME/workspace/dotfiles"
if [[ ! -d "$DOTFILES_DIR" ]]; then
    print_status "Cloning dotfiles repository..."
    mkdir -p "$HOME/workspace"
    # You'll need to replace this with your actual dotfiles repo URL
    print_warning "Please manually clone your dotfiles to $DOTFILES_DIR and rerun this script"
    print_warning "Or update this script with your dotfiles repository URL"
    exit 1
fi

# Step 5: Stow dotfiles
print_status "Setting up dotfiles with Stow..."
DOTFILES_MAC_DIR="$DOTFILES_DIR/mac-config/mac-dotfiles"

if [[ -d "$DOTFILES_MAC_DIR" ]]; then
    cd "$DOTFILES_MAC_DIR"
    
    # Stow each package
    for package in */; do
        package=${package%/}  # Remove trailing slash
        print_status "Stowing $package..."
        stow -t ~ "$package"
    done
    
    print_success "All dotfiles stowed successfully"
else
    print_error "Mac dotfiles directory not found at $DOTFILES_MAC_DIR"
    exit 1
fi

# Step 6: Apply macOS defaults
print_status "Applying macOS system preferences..."
INSTALL_DIR="$DOTFILES_DIR/mac-config/mac-install"
if [[ -f "$INSTALL_DIR/set-defaults.sh" ]]; then
    "$INSTALL_DIR/set-defaults.sh"
    print_success "macOS defaults applied"
else
    print_warning "set-defaults.sh not found, skipping system preferences"
fi

# Step 7: Setup shell (if needed)
print_status "Configuring shell..."
if [[ "$SHELL" != */zsh ]]; then
    chsh -s $(which zsh)
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
