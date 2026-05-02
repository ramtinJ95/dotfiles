# Common Dotfiles

Shared GNU Stow packages that are installed on both macOS and Arch Linux.

Only packages whose managed files should be identical across operating systems
belong here. Keep packages with OS-specific settings in the platform trees until
they are intentionally split into shared files plus a small OS overlay.

## Packages

- `agents/` - User-level `.agents/skills` tree
- `pi/` - Pi agent configuration, extensions, and skills

## Usage

From the repository root:

```bash
scripts/dotfiles doctor
scripts/dotfiles stow mac
scripts/dotfiles stow arch
```

Choose the command for the current platform. Each command installs the shared
package list first, then the selected platform package list. To remove only the
shared packages, use raw Stow:

```bash
stow -D -d common-config/common-dotfiles -t "$HOME" $(cat packages/common.txt)
```

The platform-specific package lists are installed separately after this shared
layer.

## Existing Machine Migration

If a machine already has symlinks from the old platform-local `agents` or `pi`
packages, remove only those stale managed links before stowing this shared root:

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

Do not remove Pi runtime state such as `auth.json`, `sessions/`, or `git/`.
