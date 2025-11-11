#!/usr/bin/env bash

# Theme switcher with menu selection

CONFIG_DIR="${XDG_CONFIG_HOME:-$HOME/.config}"
TMUX_CONF="$HOME/.tmux.conf"

# Available themes - add new themes here
declare -A THEMES=(
    ["archwave"]="Archwave"
    ["batou"]="Batou"
    ["catppuccin"]="Catppuccin Mocha"
    ["mechanoonna"]="Mechanoonna"
)

# Theme configurations
declare -A K9S_THEMES=(
    ["archwave"]="archwave"
    ["batou"]="batou"
    ["catppuccin"]="catppuccin-mocha"
    ["mechanoonna"]="mechanoonna"
)

declare -A STARSHIP_THEMES=(
    ["archwave"]="archwave"
    ["batou"]="batou"
    ["catppuccin"]="catppuccin_mocha"
    ["mechanoonna"]="mechanoonna"
)

declare -A YAZI_THEMES=(
    ["archwave"]="archwave"
    ["batou"]="batou"
    ["catppuccin"]="catppuccin-mocha"
    ["mechanoonna"]="mechanoonna"
)

# Detect current theme from starship config
current_theme=$(grep -E '^palette = "(archwave|batou|catppuccin_mocha|mechanoonna)"' "$CONFIG_DIR/starship.toml" 2>/dev/null | sed 's/palette = "\(.*\)"/\1/' | sed 's/_mocha//' || echo "archwave")

# Function to display theme selection menu
show_theme_menu() {
    echo "Available themes:"
    echo "================"
    local i=1
    for theme_key in "${!THEMES[@]}"; do
        local marker=""
        if [ "$theme_key" = "$current_theme" ]; then
            marker=" (current)"
        fi
        echo "$i) ${THEMES[$theme_key]}$marker"
        ((i++))
    done
    echo "================"
}

# Function to get theme key by number
get_theme_by_number() {
    local num=$1
    local i=1
    for theme_key in "${!THEMES[@]}"; do
        if [ $i -eq $num ]; then
            echo "$theme_key"
            return
        fi
        ((i++))
    done
}

# Show menu and get user selection
show_theme_menu
read -p "Select theme number: " selection

# Validate selection
if ! [[ "$selection" =~ ^[0-9]+$ ]] || [ "$selection" -lt 1 ] || [ "$selection" -gt ${#THEMES[@]} ]; then
    echo "Invalid selection. Please enter a number between 1 and ${#THEMES[@]}"
    exit 1
fi

new_theme=$(get_theme_by_number "$selection")

if [ "$new_theme" = "$current_theme" ]; then
    echo "Already using ${THEMES[$new_theme]}. No changes needed."
    exit 0
fi

echo "Switching from ${THEMES[$current_theme]} to ${THEMES[$new_theme]}..."

# Update k9s config
if [ -f "$CONFIG_DIR/k9s/config.yaml" ]; then
    # Replace any existing skin with the new one
    sed -i "s/skin: .*/skin: ${K9S_THEMES[$new_theme]}/" "$CONFIG_DIR/k9s/config.yaml"
fi

# Update starship config
if [ -f "$CONFIG_DIR/starship.toml" ]; then
    # Replace any existing palette with the new one
    sed -i "s/palette = \".*\"/palette = \"${STARSHIP_THEMES[$new_theme]}\"/" "$CONFIG_DIR/starship.toml"
fi

# Update yazi config
if [ -f "$CONFIG_DIR/yazi/theme.toml" ]; then
    # Replace any existing dark theme with the new one
    sed -i "s/dark = \".*\"/dark = \"${YAZI_THEMES[$new_theme]}\"/" "$CONFIG_DIR/yazi/theme.toml"
fi

# Update tmux config (comment/uncomment blocks)
if [ -f "$TMUX_CONF" ]; then
    # Comment all theme blocks first
    for theme_key in "${!THEMES[@]}"; do
        sed -i "/# ${theme_key} theme start/,/# ${theme_key} theme end/ s/^set /# set /" "$TMUX_CONF"
    done
    
    # Uncomment the selected theme block
    sed -i "/# ${new_theme} theme start/,/# ${new_theme} theme end/ s/^# set /set /" "$TMUX_CONF"
fi

echo "Theme switched to ${THEMES[$new_theme]}"
echo "Reload your configs (tmux: prefix + r, starship: new shell)"
