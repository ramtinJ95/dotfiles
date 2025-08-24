#!/bin/bash

echo "Setting macOS defaults..."

# Dock preferences
echo "→ Setting Dock preferences..."
defaults write com.apple.dock autohide -bool true
defaults write com.apple.dock launchanim -bool false
defaults write com.apple.dock "mru-spaces" -bool false

# Keyboard preferences  
echo "→ Setting keyboard preferences..."
defaults write -g KeyRepeat -int 2
defaults write -g InitialKeyRepeat -int 25

# Finder preferences
echo "→ Setting Finder preferences..."
defaults write com.apple.finder ShowStatusBar -bool true
defaults write com.apple.finder ShowPathbar -bool true
defaults write com.apple.finder FXDefaultSearchScope -string "SCcf"
defaults write com.apple.finder FXEnableExtensionChangeWarning -bool false

# Screenshot preferences
echo "→ Setting screenshot preferences..."
defaults write com.apple.screencapture type -string "png"
defaults write com.apple.screencapture disable-shadow -bool true

# Menu bar preferences
echo "→ Setting menu bar preferences..."
defaults write com.apple.menuextra.clock DateFormat -string "EEE MMM d  h:mm a"

# Activity Monitor preferences
echo "→ Setting Activity Monitor preferences..."
defaults write com.apple.ActivityMonitor OpenMainWindow -bool true
defaults write com.apple.ActivityMonitor IconType -int 5
defaults write com.apple.ActivityMonitor ShowCategory -int 0

# Trackpad preferences
echo "→ Setting trackpad preferences..."
defaults write com.apple.driver.AppleBluetoothMultitouch.trackpad Clicking -bool true
defaults write com.apple.AppleMultitouchTrackpad Clicking -bool true

# Global UI preferences
echo "→ Setting global UI preferences..."
defaults write -g AppleShowAllExtensions -bool true
defaults write -g NSDocumentSaveNewDocumentsToCloud -bool false

echo "→ Restarting affected applications..."
for app in "Dock" "Finder" "SystemUIServer"; do
    killall "${app}" &> /dev/null
done

echo "✓ macOS defaults applied successfully!"
echo "Note: Some changes may require a logout/restart to take effect."