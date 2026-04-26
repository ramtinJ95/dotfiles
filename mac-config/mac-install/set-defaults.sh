#!/bin/bash

echo "Setting macOS defaults..."

# Dock preferences
echo "→ Setting Dock preferences..."
defaults write com.apple.dock autohide -bool true
defaults write com.apple.dock autohide-delay -float 0
defaults write com.apple.dock autohide-time-modifier -float 0.15
defaults write com.apple.dock launchanim -bool false
defaults write com.apple.dock "mru-spaces" -bool false
defaults write com.apple.dock show-recents -bool false
defaults write com.apple.dock expose-animation-duration -float 0.1

# Keyboard preferences  
echo "→ Setting keyboard preferences..."
defaults write -g KeyRepeat -int 2
defaults write -g InitialKeyRepeat -int 25
defaults write -g ApplePressAndHoldEnabled -bool false

# Caps Lock to Control, matching the current machine.
defaults -currentHost write -g "com.apple.keyboard.modifiermapping.0-0-0" -array \
    '{ HIDKeyboardModifierMappingSrc = 30064771129; HIDKeyboardModifierMappingDst = 30064771300; }'

# Finder preferences
echo "→ Setting Finder preferences..."
defaults write com.apple.finder ShowStatusBar -bool true
defaults write com.apple.finder ShowPathbar -bool true
defaults write com.apple.finder FXDefaultSearchScope -string "SCcf"
defaults write com.apple.finder FXEnableExtensionChangeWarning -bool false

# Screenshot preferences
echo "→ Setting screenshot preferences..."
mkdir -p "$HOME/Screenshots"
defaults write com.apple.screencapture location -string "$HOME/Screenshots"
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
defaults write -g NSWindowResizeTime -float 0.001
defaults write -g NSAutomaticCapitalizationEnabled -bool false
defaults write -g NSAutomaticPeriodSubstitutionEnabled -bool false
defaults write -g NSAutomaticQuoteSubstitutionEnabled -bool false
defaults write -g NSAutomaticDashSubstitutionEnabled -bool false
defaults write com.apple.universalaccess reduceMotion -bool true

echo "→ Restarting affected applications..."
for app in "cfprefsd" "Dock" "Finder" "SystemUIServer"; do
    killall "${app}" &> /dev/null
done

echo "✓ macOS defaults applied successfully!"
echo "Note: Some changes may require a logout/restart to take effect."
