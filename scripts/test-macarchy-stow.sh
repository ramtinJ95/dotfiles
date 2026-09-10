#!/usr/bin/env bash
set -euo pipefail

repo="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
scratch="$(mktemp -d)"
trap 'rm -rf "$scratch"' EXIT
mkdir -p "$scratch/stow" "$scratch/home"
cp -R "$repo/mac-config/mac-dotfiles/macarchy" "$scratch/stow/macarchy"
source_root="$scratch/stow/macarchy/.config/macarchy"
target_root="$scratch/home/.config/macarchy"

# Even mistakenly present machine data must not be published by Stow.
mkdir -p "$source_root/themes/unwanted" "$source_root/generations"
printf 'machine-only\n' > "$source_root/machine.toml"
printf 'not-an-input\n' > "$source_root/themes/unwanted/theme.toml"
stow --no-folding -d "$scratch/stow" -t "$scratch/home" macarchy
[[ -L "$target_root/profile.toml" ]]
[[ -d "$target_root" && ! -L "$target_root" ]]
[[ ! -L "$scratch/home/.config" ]]
[[ ! -e "$target_root/themes" && ! -e "$target_root/machine.toml" ]]

# Theme installs and generated state stay local, including after restow.
mkdir -p "$target_root/themes/local-theme" "$target_root/generations/local"
printf 'local-theme\n' > "$target_root/themes/local-theme/theme.toml"
printf 'generated\n' > "$target_root/generations/local/palette.json"
stow --no-folding -R -d "$scratch/stow" -t "$scratch/home" macarchy
[[ ! -L "$target_root" && ! -L "$target_root/themes" ]]
[[ -f "$target_root/themes/local-theme/theme.toml" ]]
[[ -f "$target_root/generations/local/palette.json" ]]
[[ ! -e "$source_root/themes/local-theme" && ! -e "$source_root/generations/local" ]]

git -C "$repo" check-ignore --no-index -q \
  mac-config/mac-dotfiles/macarchy/.config/macarchy/themes/test/theme.toml
if git -C "$repo" check-ignore --no-index -q \
  mac-config/mac-dotfiles/macarchy/.config/macarchy/profile.toml; then
    printf 'FAIL: portable profile is ignored by Git\n' >&2
    exit 1
fi
printf 'PASS: only portable inputs are linked; theme data survives restow outside dotfiles\n'

# Exercise the actual helper on a minimal repo, not the user’s apps or secrets.
fixture="$scratch/repo"
common="$fixture/common-config/common-dotfiles"
mac="$fixture/mac-config/mac-dotfiles"
home="$scratch/mac-home"
mkdir -p "$fixture/scripts" "$fixture/packages" "$home" \
  "$common/herdr/.config/herdr" "$common/pi/.pi/agent/themes" \
  "$mac/codex/.codex" "$mac/kitty/.config/kitty" \
  "$mac/spicetify/.config/spicetify/Themes/text"
cp "$repo/scripts/dotfiles" "$fixture/scripts/dotfiles"
cp -R "$repo/mac-config/mac-dotfiles/macarchy" "$mac/macarchy"
printf 'herdr\npi\n' > "$fixture/packages/common.txt"
printf 'codex\nmacarchy\nspicetify\n' > "$fixture/packages/mac.txt"
printf 'kitty\n' > "$fixture/packages/mac-legacy.txt"
printf '[theme]\nname = "catppuccin"\n' > "$common/herdr/.config/herdr/config.toml"
printf 'runtime\n' > "$common/herdr/.config/herdr/release-notes.json"
printf '{"theme":"dark"}\n' > "$common/pi/.pi/agent/settings.json"
printf 'private-fixture\n' > "$common/pi/.pi/agent/auth.json"
printf 'generated-fixture\n' > "$common/pi/.pi/agent/themes/macarchy-current.json"
printf 'asset\n' > "$common/pi/.pi/agent/keybindings.json"
printf 'model = "example"\n' > "$mac/codex/.codex/config.toml"
printf 'do-not-install\n' > "$mac/kitty/.config/kitty/kitty.conf"
printf 'machine-specific\n' > "$mac/spicetify/.config/spicetify/config-xpui.ini"
printf 'generated\n' > "$mac/spicetify/.config/spicetify/Themes/text/color.ini"
printf 'body {}\n' > "$mac/spicetify/.config/spicetify/Themes/text/user.css"

HOME="$home" "$fixture/scripts/dotfiles" stow mac
for path in .config/herdr/config.toml .pi/agent/settings.json .codex/config.toml; do
    [[ -f "$home/$path" && ! -L "$home/$path" ]]
done
[[ -L "$home/.config/macarchy/profile.toml" ]]
[[ -L "$home/.pi/agent/keybindings.json" ]]
[[ ! -L "$home/.config/herdr" && ! -L "$home/.pi/agent/themes" ]]
[[ ! -e "$home/.pi/agent/auth.json" ]]
[[ ! -e "$home/.pi/agent/themes/macarchy-current.json" ]]
[[ ! -e "$home/.config/herdr/release-notes.json" ]]
[[ ! -e "$home/.config/kitty/kitty.conf" ]]
[[ ! -e "$home/.config/spicetify/config-xpui.ini" ]]
[[ ! -e "$home/.config/spicetify/Themes/text/color.ini" ]]
[[ -L "$home/.config/spicetify/Themes/text/user.css" ]]

printf '[theme]\nname = "local-choice"\n' > "$home/.config/herdr/config.toml"
HOME="$home" "$fixture/scripts/dotfiles" restow mac
grep -q local-choice "$home/.config/herdr/config.toml"
grep -q catppuccin "$common/herdr/.config/herdr/config.toml"

# Existing directory ownership is a decision, never an implicit migration.
for path in .config/herdr .config/macarchy/themes; do
    blocked="$scratch/blocked-home-$path"
    mkdir -p "$(dirname "$blocked/$path")"
    ln -s "$common/herdr/.config/herdr" "$blocked/$path"
    if HOME="$blocked" "$fixture/scripts/dotfiles" stow mac > "$scratch/blocked.log" 2>&1; then
        echo "FAIL: runtime directory symlink $path was accepted" >&2
        exit 1
    fi
    [[ -L "$blocked/$path" && ! -e "$blocked/.config/macarchy/profile.toml" ]]
    grep -q "migrate its ownership" "$scratch/blocked.log"
done
printf 'PASS: macOS helper separates assets, mutable configs, legacy providers and runtime data\n'
