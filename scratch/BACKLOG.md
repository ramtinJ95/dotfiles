# Backlog

## Cleanup candidates found during dotfiles orientation

- `mac-config/mac-dotfiles/zsh/.zshrc:58` still appends `/Users/ramjav/.local/bin`, which looks like a stale username path alongside the current `/Users/ramtinjavanmardi/.local/bin` entry at line 64.
- `mac-config/mac-dotfiles/git/.gitconfig:27` points `core.excludesfile` at `/Users/ramjav/.gitignore`, which looks stale for the current macOS home path.
- `mac-config/mac-install/install.sh:92-95` still contains placeholder clone instructions and exits if the repo is missing, while the README presents the script as the fresh-machine quick start.
- `mac-config/mac-dotfiles/codex/.stow-local-ignore:1` only ignores the ignore file itself, so the macOS Codex package would stow `config.toml` and any future `.codex/skills` content; this differs from the Arch Codex package policy documented in `arch-config/arch-dotfiles/README.md:60`.
- `mac-config/mac-dotfiles/codex/.codex/prompts/brainstormin.md:1`, `mac-config/mac-dotfiles/codex/.codex/prompts/agent-brainstormin.md:1`, `arch-config/arch-dotfiles/codex/.codex/prompts/brainstormin.md:1`, and `arch-config/arch-dotfiles/codex/.codex/prompts/agent-brainstormin.md:1` are byte-identical by SHA-256, so this prompt looks duplicated across names and platforms.
- `arch-config/arch-dotfiles/codex/.codex/AGENTS.md:4` still says to use the researcher agent for docs, while the macOS Codex instructions use the current ctx7 CLI wording.
- `common-config/common-dotfiles/pi/.pi/agent/AGENTS.md:4` says "Pre proactive" instead of "Be proactive"; line 15 also has inconsistent rule indentation and the file lacks a closing `</rules>` tag.
- `mac-config/mac-dotfiles/zsh/.zshrc:1`, `mac-config/mac-dotfiles/zsh/.zshrc:2`, `mac-config/mac-dotfiles/zsh/.zshrc:63`, `mac-config/mac-dotfiles/zsh/.zshrc:65`, and `mac-config/mac-dotfiles/zsh/.zshrc:77` hard-code the current home directory, which makes the macOS bootstrap less portable to a new user/home path.
- `arch-config/arch-dotfiles/claude/.claude/CLAUDE.md:4` and `arch-config/arch-dotfiles/claude/.claude/agents/docs-researcher.md:14-17` still describe the old researcher-agent/MCP workflow, while the macOS Claude docs use the current `ctx7`/`gh` CLI wording in `mac-config/mac-dotfiles/claude/.claude/CLAUDE.md:4` and `mac-config/mac-dotfiles/claude/.claude/agents/docs-researcher.md:12-16`.
- `mac-config/mac-install/install.sh:79-84` looks for `Brewfile` in the caller's current directory, while `mac-config/mac-install/README.md:28-29` only works because it tells the user to `cd` first; running the script by path from the repo root would fail before package install.
