#!/bin/bash

# macOS Homebrew Setup Script
# Run this script on a new Mac to install all your apps and tools

set -e  # Exit on any error

echo "🍺 Starting macOS setup with Homebrew..."

# Check if we're on macOS
if [[ "$OSTYPE" != "darwin"* ]]; then
    echo "❌ This script is designed for macOS only"
    exit 1
fi

# Install Xcode Command Line Tools if not already installed
if ! xcode-select -p &>/dev/null; then
    echo "📱 Installing Xcode Command Line Tools..."
    xcode-select --install
    
    echo "⏳ Please complete the Xcode Command Line Tools installation and then press any key to continue..."
    read -n 1 -s
fi

# Install Homebrew if not already installed
if ! command -v brew &>/dev/null; then
    echo "🍺 Installing Homebrew..."
    /bin/bash -c "$(curl -fsSL https://raw.githubusercontent.com/Homebrew/install/HEAD/install.sh)"
    
    # Add Homebrew to PATH for Apple Silicon Macs
    if [[ $(uname -m) == "arm64" ]]; then
        echo 'eval "$(/opt/homebrew/bin/brew shellenv)"' >> ~/.zprofile
        eval "$(/opt/homebrew/bin/brew shellenv)"
    fi
else
    echo "✅ Homebrew is already installed"
fi

# Update Homebrew
echo "🔄 Updating Homebrew..."
brew update

# Check if Brewfile exists in the same directory as this script
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
BREWFILE="$SCRIPT_DIR/Brewfile"

if [[ ! -f "$BREWFILE" ]]; then
    echo "❌ Brewfile not found at $BREWFILE"
    echo "Please make sure your Brewfile is in the same directory as this script"
    exit 1
fi

# Install everything from Brewfile
echo "📦 Installing packages from Brewfile..."
brew bundle install --file="$BREWFILE"

# Cleanup
echo "🧹 Cleaning up..."
brew cleanup

echo ""
echo "🎉 Setup complete! Your Mac is now configured with all your Homebrew packages."
echo ""
echo "You might want to:"
echo "  - Restart your terminal or run 'source ~/.zprofile'"
echo "  - Check if any manual configuration is needed for installed apps"
echo "  - Run 'brew doctor' to check for any issues"
