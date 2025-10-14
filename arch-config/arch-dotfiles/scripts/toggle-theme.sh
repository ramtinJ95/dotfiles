#!/usr/bin/env bash

# Toggle between archwave and catppuccin themes

CONFIG_DIR="${XDG_CONFIG_HOME:-$HOME/.config}"
TMUX_CONF="$HOME/.tmux.conf"

# Detect current theme from starship config
current_theme=$(grep -q "catppuccin_mocha" "$CONFIG_DIR/starship.toml" 2>/dev/null && echo "catppuccin" || echo "archwave")

if [ "$current_theme" = "catppuccin" ]; then
    new_theme="archwave"
    echo "Switching from catppuccin to archwave..."
else
    new_theme="catppuccin"
    echo "Switching from archwave to catppuccin..."
fi

# Toggle k9s config (catppuccin-mocha <-> archwave)
if [ -f "$CONFIG_DIR/k9s/config.yaml" ]; then
    if [ "$new_theme" = "catppuccin" ]; then
        sed -i "s/skin: archwave/skin: catppuccin-mocha/" "$CONFIG_DIR/k9s/config.yaml"
    else
        sed -i "s/skin: catppuccin-mocha/skin: archwave/" "$CONFIG_DIR/k9s/config.yaml"
    fi
fi

# Toggle starship config (catppuccin_mocha <-> archwave)
if [ -f "$CONFIG_DIR/starship.toml" ]; then
    if [ "$new_theme" = "catppuccin" ]; then
        sed -i '1s/palette = "archwave"/palette = "catppuccin_mocha"/' "$CONFIG_DIR/starship.toml"
    else
        sed -i '1s/palette = "catppuccin_mocha"/palette = "archwave"/' "$CONFIG_DIR/starship.toml"
    fi
fi

# Toggle yazi config (catppuccin-mocha <-> archwave)
if [ -f "$CONFIG_DIR/yazi/theme.toml" ]; then
    if [ "$new_theme" = "catppuccin" ]; then
        sed -i 's/dark = "archwave"/dark = "catppuccin-mocha"/' "$CONFIG_DIR/yazi/theme.toml"
    else
        sed -i 's/dark = "catppuccin-mocha"/dark = "archwave"/' "$CONFIG_DIR/yazi/theme.toml"
    fi
fi

# Toggle tmux config (comment/uncomment blocks)
if [ -f "$TMUX_CONF" ]; then
    if [ "$new_theme" = "catppuccin" ]; then
        # Comment archwave, uncomment catppuccin
        sed -i '/# archwave theme start/,/# archwave theme end/ s/^set /# set /' "$TMUX_CONF"
        sed -i '/# catppuccin theme start/,/# catppuccin theme end/ s/^# set /set /' "$TMUX_CONF"
    else
        # Comment catppuccin, uncomment archwave
        sed -i '/# catppuccin theme start/,/# catppuccin theme end/ s/^set /# set /' "$TMUX_CONF"
        sed -i '/# archwave theme start/,/# archwave theme end/ s/^# set /set /' "$TMUX_CONF"
    fi
fi

echo "Theme switched to $new_theme"
echo "Reload your configs (tmux: prefix + r, starship: new shell)"
