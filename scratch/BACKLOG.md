# Backlog

## Cleanup candidates found during dotfiles orientation

- `mac-config/mac-dotfiles/zsh/.zshrc:58` still appends `/Users/ramjav/.local/bin`, which looks like a stale username path alongside the current `/Users/ramtinjavanmardi/.local/bin` entry at line 64.
- `mac-config/mac-dotfiles/git/.gitconfig:27` points `core.excludesfile` at `/Users/ramjav/.gitignore`, which looks stale for the current macOS home path.
- `mac-config/mac-install/install.sh:92-95` still contains placeholder clone instructions and exits if the repo is missing, while the README presents the script as the fresh-machine quick start.
- `mac-config/mac-dotfiles/codex/.stow-local-ignore:1` only ignores the ignore file itself, so the macOS Codex package would stow `config.toml` and any future `.codex/skills` content; this differs from the Arch Codex package policy documented in `arch-config/arch-dotfiles/README.md:45`.
- `mac-config/mac-dotfiles/codex/.codex/prompts/brainstormin.md:1`, `mac-config/mac-dotfiles/codex/.codex/prompts/agent-brainstormin.md:1`, `arch-config/arch-dotfiles/codex/.codex/prompts/brainstormin.md:1`, and `arch-config/arch-dotfiles/codex/.codex/prompts/agent-brainstormin.md:1` are byte-identical by SHA-256, so this prompt looks duplicated across names and platforms.
- `arch-config/arch-dotfiles/codex/.codex/AGENTS.md:4` still says to use the researcher agent for docs, while the macOS Codex instructions use the current ctx7 CLI wording.
- `arch-config/arch-dotfiles/README.md:16` lists `spicetify/`, but there is no `arch-config/arch-dotfiles/spicetify` package directory.
- `README.md:37` lists Bat under shared configurations, but `bat/` currently exists only under `mac-config/mac-dotfiles`.
- `mac-config/mac-dotfiles/pi/.pi/agent/AGENTS.md:4` and `arch-config/arch-dotfiles/pi/.pi/agent/AGENTS.md:4` say "Pre proactive" instead of "Be proactive"; line 15 in both files also has inconsistent rule indentation and the file lacks a closing `</rules>` tag.
- `mac-config/mac-dotfiles/zsh/.zshrc:1`, `mac-config/mac-dotfiles/zsh/.zshrc:2`, `mac-config/mac-dotfiles/zsh/.zshrc:63`, `mac-config/mac-dotfiles/zsh/.zshrc:65`, and `mac-config/mac-dotfiles/zsh/.zshrc:77` hard-code the current home directory, which makes the macOS bootstrap less portable to a new user/home path.
