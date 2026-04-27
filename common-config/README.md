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
stow -d common-config/common-dotfiles -t "$HOME" $(cat packages/common.txt)
```

To remove the shared packages:

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

stow -R -d common-config/common-dotfiles -t "$HOME" $(cat packages/common.txt)
```

Do not remove Pi runtime state such as `auth.json`, `sessions/`, or `git/`.
