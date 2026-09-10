# Dotfiles

Personal configuration inputs for macOS and Arch Linux, managed with [GNU Stow](https://www.gnu.org/software/stow/). Macarchy owns the managed macOS environment and generated themes; Arch retains its standalone configuration.

## Platforms

### macOS
Macarchy-backed setup: Stow portable inputs and personal tools, then review and
apply Macarchy’s native package/configuration plan. Requires Apple Silicon,
macOS 26, Homebrew and Xcode Command Line Tools.

**Quick Start:**
```bash
mac-config/mac-install/install.sh
```

The first invocation prepares dotfiles and shows the plan; it does **not**
automatically approve or apply it. The old Brewfile and standalone provider
configs are retained as references, not installed by this path.

See [mac-config/mac-install/README.md](mac-config/mac-install/README.md) for detailed setup instructions.

### Arch Linux
Modular dotfiles managed with GNU Stow for a Hyprland-based desktop environment.

**Quick Start:**
```bash
scripts/dotfiles doctor
scripts/dotfiles stow arch
```

See [arch-config/arch-dotfiles/README.md](arch-config/arch-dotfiles/README.md) for detailed usage.

## What's Included

### Shared Configurations
- **Agents** - Canonical user-level `.agents/AGENTS.md` and `.agents/skills` tree for shared agent instructions and skills
- **Pi** - Pi agent configuration, extensions, and skills

### macOS Specific
- **Macarchy profile** - Portable provider, preset, package and bar choices
- **Macarchy-managed tools** - Yabai/skhd, SketchyBar, Kitty, zsh, Neovim and daily tools
- **Personal assets** - Agent tools, Git, tmux and Spicetify behavior assets
- **Native config seeds** - Herdr, Pi and Codex get local writable copies when absent

### Arch Linux Specific
- **Hyprland** - Wayland compositor
- **Bash + ble.sh** - Enhanced bash with line editor
- **TLP** - Power management
- **Hypridle/Hyprlock** - Idle management and screen locking
- **Ghostty, k9s, Waybar** - Arch desktop and terminal tooling

### Platform Packages With Similar Names

Some packages exist in both platform trees because most of their files still
differ by operating system. `claude` and `codex` share their global instruction
file through symlinks, but keep platform-specific commands, settings, runtime
state, and skills in the platform trees for now.

## Theme

Macarchy supplies the active macOS theme. Installed theme packages, imported
wallpapers, generated palettes and runtime state stay outside dotfiles under
the real `~/.config/macarchy` directory. Only its profile and intentional
override inputs are linked. Arch and the retained standalone configs use their
own saved themes; `wallpapers/` is a separate static collection.

## Helper Commands

Run these commands from the repository root.

```bash
# Validate package lists, clean Stow dry-runs, symlinks, shell, and JSON
scripts/dotfiles doctor

# Install user-level dotfiles
scripts/dotfiles stow mac
scripts/dotfiles stow arch

# Restow after package moves or config updates
scripts/dotfiles restow mac
scripts/dotfiles restow arch

# Install Arch system packages
sudo scripts/dotfiles stow arch-system
sudo scripts/dotfiles restow arch-system
```

Use the helper for macOS so its ownership exclusions, local config seeds and
`--no-folding` policy are applied. It refuses existing runtime directory links
instead of silently migrating them. See the macOS guide before restowing an
existing Macarchy machine.

Raw Stow is appropriate for unrelated one-off packages:

```bash
# Install a personal package (not a Macarchy-managed provider)
stow --no-folding -d mac-config/mac-dotfiles -t "$HOME" git

# Remove a package
stow -D -d common-config/common-dotfiles -t "$HOME" pi
```

## Shared Agent Instructions and Skills

The canonical cross-harness instruction file is:

```text
common-config/common-dotfiles/agents/.agents/AGENTS.md
```

Harness-specific instruction paths symlink back to that file:

- Pi: `common-config/common-dotfiles/pi/.pi/agent/AGENTS.md`
- Claude Code: `mac-config/mac-dotfiles/claude/.claude/CLAUDE.md` and `arch-config/arch-dotfiles/claude/.claude/CLAUDE.md`
- Codex: `mac-config/mac-dotfiles/codex/.codex/AGENTS.md` and `arch-config/arch-dotfiles/codex/.codex/AGENTS.md`

Put cross-harness skills in `common-config/common-dotfiles/agents/.agents/skills`.
Pi discovers `~/.agents/skills` directly, so shared skills should not be
duplicated under `.pi/agent/skills`. Claude and Codex keep native skill entries
as repo-relative symlinks back to the shared `.agents` skills.

### Legacy shared-agent migration

The following older recipe is for Arch or unmanaged installations. **Do not run
it over Macarchy-owned settings or theme links.** On managed macOS, use the
ownership guidance in [the macOS guide](mac-config/mac-install/README.md#existing-machines).

If this machine already used the old platform-local `agents` and `pi` packages,
remove stale managed links before stowing from the new shared root. This keeps
Pi runtime files such as `auth.json`, `sessions/`, and `git/` in place.

```bash
for path in \
  "$HOME/.agents/skills" \
  "$HOME/.agents/.skill-lock.json" \
  "$HOME/.pi/agent/agents" \
  "$HOME/.pi/agent/extensions" \
  "$HOME/.pi/agent/keybindings.json" \
  "$HOME/.pi/agent/settings.json" \
  "$HOME/.pi/agent/skills"
do
  [[ -L "$path" ]] && rm "$path"
done

cmp -s "$HOME/.pi/agent/AGENTS.md" common-config/common-dotfiles/pi/.pi/agent/AGENTS.md \
  && rm "$HOME/.pi/agent/AGENTS.md"

scripts/dotfiles restow mac
```

Use `scripts/dotfiles restow arch` instead on Arch Linux.

## Repository Structure

```
dotfiles/
├── common-config/
│   └── common-dotfiles/    # Shared Stow packages
├── mac-config/
│   ├── mac-install/        # Automated setup scripts
│   └── mac-dotfiles/       # Stow packages for macOS
├── arch-config/
│   └── arch-dotfiles/      # Stow packages for Arch Linux
├── packages/               # Explicit package lists for Stow commands
├── wallpapers/             # Catppuccin-themed wallpapers
├── legacy-nvim-config/     # Backup of previous Neovim setup
└── piantor_keymap.json     # Custom keyboard layout
```

## Getting Started

1. **Clone the repository:**
   ```bash
   git clone git@github.com:ramtinJ95/dotfiles.git ~/workspace/dotfiles
   cd ~/workspace/dotfiles
   ```

2. **Choose your platform:**
   - **macOS**: Follow [mac-config/mac-install/README.md](mac-config/mac-install/README.md)
   - **Arch Linux**: Follow [arch-config/arch-dotfiles/README.md](arch-config/arch-dotfiles/README.md)

3. **Customize** the configurations to match your preferences

## Important Notes

- **Backup your existing configurations** before installing
- Some macOS preferences require logout/restart to take effect
- Arch TLP configuration requires sudo to install system files
- Review scripts before running automated installers

## License

Personal configurations - feel free to use and modify as needed.
