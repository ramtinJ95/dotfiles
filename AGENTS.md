# Dotfiles repo rules

These rules are for working on this repository. They are not the user's global
agent instructions, which this repo also stores and which load in every project
on every harness:

- `common-config/common-dotfiles/agents/.agents/AGENTS.md` (Pi, Codex, Arch Claude link here)
- `mac-config/mac-dotfiles/claude/.claude/CLAUDE.md`

Edit those only when the user asks about global agent behavior. On macOS the
Claude file is currently a standalone copy whose content has drifted from the
shared AGENTS.md; ask before reconciling them.

## This repo is live config

Most of `$HOME` is symlinked into this tree: `~/.claude`, `~/.zshrc`, Pi, Codex,
Herdr, skills. Editing a file here changes the running setup immediately,
including the settings, hooks, and skills of the agent doing the editing.

- Edit the repo path, not the `$HOME` symlink; some tools refuse to write through links.
- Herdr `config.toml`, Pi `settings.json`, and Codex `config.toml` are seeded
  once by `scripts/dotfiles` as ordinary local files. Editing the repo copy does
  not change the live file, and live edits never flow back here.
- Never read, print, or commit secrets: settings `env` blocks, MCP headers, Pi
  `auth.json`. Never remove Pi runtime state (`auth.json`, `sessions/`, `git/`).

## Ownership

- Macarchy owns the managed macOS environment and generated themes. Do not edit
  generated `macarchy-current.*` palettes; change the Macarchy profile or
  `overrides/` instead.
- `packages/*.txt` decide which Stow packages the helper installs. A package
  directory missing from those lists is not installed.
- Same-named packages under `mac-config` and `arch-config` (`claude`, `codex`,
  `nvim`, ...) are intentionally separate. Change only the current platform
  unless asked; Arch changes cannot be tested on this Mac, so say so.
- The macOS runtime roots checked by `scripts/dotfiles` (`~/.config/macarchy/*`,
  `~/.pi/agent`, `~/.codex`, ...) must stay real directories, never folded links.

## Commands

- Never run `scripts/dotfiles stow|restow`, raw `stow`, `mac-install/install.sh`,
  or `set-defaults.sh` without asking: they rewrite `$HOME`.
- Verify with `scripts/dotfiles doctor`. It may already report unrelated
  failures, so compare its output before and after your change. Inside the
  Claude Code sandbox its Stow dry-runs fail on `mktemp`; that is the sandbox.

## Agent harness files in this repo

- Shared skills go in `common-config/common-dotfiles/agents/.agents/skills/<name>`.
  Pi and Codex read that directory directly; do not duplicate skills under
  `.pi` or `.codex`. Claude needs a bridge symlink in both `mac-config` and
  `arch-config` `claude/.claude/skills/`, pointing exactly at
  `../../../../../common-config/common-dotfiles/agents/.agents/skills/<name>`.
  When removing a shared skill, remove its directory and both bridges; `doctor`
  checks every bridge.
- `~/.claude` is `mac-config/mac-dotfiles/claude/.claude`, and Claude Code
  writes caches, sessions, and daemon state there. The root `.gitignore`
  allowlists only the portable setup. A new setup file or directory needs its
  own `!` line, otherwise it is silently ignored. Never commit runtime state,
  `*.bak*` copies, or `settings.local.json`.

## Docs

`README.md`, `common-config/README.md`, and `mac-config/mac-install/README.md`
describe setup and ownership. Update the matching README when you change
install behavior, package lists, or ownership rules.
