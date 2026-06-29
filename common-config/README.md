# Common Dotfiles

Shared GNU Stow packages that are installed on both macOS and Arch Linux.

Only packages whose managed files should be identical across operating systems
belong here. Keep packages with OS-specific settings in the platform trees until
they are intentionally split into shared files plus a small OS overlay.

## Packages

- `agents/` - Canonical user-level `.agents/AGENTS.md` and `.agents/skills` tree for shared agent instructions and skills
- `pi/` - Pi agent configuration, extensions, and skills

## Shared Agent Instructions and Skills

Cross-harness instructions live in `common-dotfiles/agents/.agents/AGENTS.md`.
Each harness keeps the filename it expects, but links back to that canonical
file:

- Pi: `.pi/agent/AGENTS.md`
- Claude Code: `.claude/CLAUDE.md`
- Codex: `.codex/AGENTS.md`

Cross-harness skills live in `common-dotfiles/agents/.agents/skills`. Pi and
Codex load that global skill directory directly through `~/.agents/skills`; do
not add duplicate shared-skill links under `.pi/agent/skills` or `.codex/skills`.
Claude does not read `~/.agents/skills`, so the macOS and Arch Claude packages
bridge every shared skill with repo-relative symlinks from `.claude/skills`.

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

If a machine already has symlinks from the old platform-local `agents`, `pi`,
or Codex skill packages, remove only those stale managed links before stowing
this shared root:

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

if [[ -d "$HOME/.codex/skills" ]]; then
  find "$HOME/.codex/skills" -maxdepth 1 -type l -exec rm {} +
  rmdir "$HOME/.codex/skills" 2>/dev/null || true
fi

cmp -s "$HOME/.pi/agent/AGENTS.md" common-config/common-dotfiles/pi/.pi/agent/AGENTS.md \
  && rm "$HOME/.pi/agent/AGENTS.md"

scripts/dotfiles restow mac
```

Use `scripts/dotfiles restow arch` instead on Arch Linux.

Do not remove Pi runtime state such as `auth.json`, `sessions/`, or `git/`.
