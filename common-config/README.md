# Common Dotfiles

Shared GNU Stow packages that are installed on both macOS and Arch Linux.

Only packages whose managed files should be identical across operating systems
belong here. Keep packages with OS-specific settings in the platform trees until
they are intentionally split into shared files plus a small OS overlay.

## Packages

- `agents/` - Canonical user-level `.agents/AGENTS.md` and `.agents/skills` tree for shared agent instructions and skills
- `pi/` - Pi agent configuration, extensions, and skills

## Claude Code Statusline

`claude/statusline.sh` is not a Stow package. The mac and arch `claude`
packages each link `.claude/statusline.sh` to it, so both platforms run one
script; its OS-specific `stat`, credential and date calls switch on `uname`.

## Pi Setup

On each Arch machine (Node must be at least 22.19):

```bash
sudo pacman -S --needed nodejs npm git stow
cd ~/dotfiles
git pull --ff-only
./scripts/pi-setup
export PATH="$HOME/.local/bin:$PATH"
pi
```

For a new checkout, first `git clone git@github.com:ramtinJ95/dotfiles.git ~/dotfiles`.
The same script works on macOS with Node/npm and GNU Stow installed. Add
`~/.local/bin` first on your shell's PATH permanently. Close Pi sessions before
syncing settings on an existing machine, so they cannot overwrite the update.

The script installs **Pi 1.5.0** under `~/.local` without sudo and installs the
exact extension versions in the shared `settings.json`, including the Herdr Core
Shepherdr prerelease and notes-compaction. It links **only** the `agents` and `pi`
packages; it does not install the old Herdr TUI, desktop settings, or Mac local
LLM servers. Package installation failures stop the command rather than silently
skipping an extension. Individual install commands have a five-minute timeout.
It also loads the installed extensions through Pi's resource loader, requires
the Core `agents` tool, and checks custom tools through the installed adapter's
actual discovery/parser. Loading, missing-tool and disabled-tool errors fail
setup without making a model request.

Run `/login` inside Pi on each machine. Credentials are never copied. Additional
capabilities need their own local prerequisites:

- Herdr-managed interactive agents: the **Herdr app/Core** and its `hc` CLI;
  launch Pi inside the app. The old `herdr` TUI is not a substitute.
  In Pi, use `agents` (`tools.agents` in Code Mode) for agent operations,
  `herdr-app` for window/layout operations, and `hc` for non-agent processes.
  The shared Herdr skill describes this division. Legacy `spawn_agent`,
  `herdr_agent` and the TUI state hook are no longer installed.
- Claude delegation: install and authenticate Claude Code separately.
- Exa tools: set `EXA_API_KEY` (Arch cannot use this Mac's Keychain entry).
- Semantic browser tools: set `TYPESAFE_API_KEY` and use an existing CDP-enabled
  browser. Remote host aliases/paths in the browser integration need per-machine
  setup; see its [README](common-dotfiles/pi/.pi/agent/codex-conversion-custom-tools/browser/README.md).
- Atuin history and voice: install Atuin/audio prerequisites separately; choose
  local audio devices rather than copying macOS CoreAudio IDs.

### Updating and ownership

After pulling, rerun `scripts/pi-setup` to synchronize the shared setup.
It replaces the configured package list with the shared list and merges the
portable settings, preserving local theme, audio devices, and unrelated keys.
Changed configs are backed up under `~/.pi/backups/setup-*` with private permissions.
`--config-only` performs the same configuration update without installing/running Pi.

On Linux with an active Omarchy-generated `~/.local/state/omarchy/current/theme/pi.json`,
both Pi setup and Arch Stow select `omarchy-system` using `omarchy theme set pi --activate`.
Omarchy updates that local palette on theme changes; Pi hot-reloads it. No generated
palette or polling extension is tracked here. Restart existing Pi sessions after
setup. macOS and non-Omarchy machines retain their local theme as before.

Inside Herdr, the `herdr-appearance` Pi extension temporarily uses warm, readable
code panels in Cosy/Cabin layouts. Leaving them restores the native work theme;
the saved Pi preference and generated Omarchy/Macarchy palettes are unchanged.
**Ctrl-f r** opens Herdr's layout/look picker after `scripts/herdr-mods install`.
See [work/café looks](herdr-app/mods/appearance/README.md).

Custom-tool `*.toml` definitions are **regular local files**, not Stow links:
the adapter's discovery ignores file symlinks. Their companion scripts remain
linked. Setup syncs definitions from the checkout with private backups under
`~/.pi/backups/tools-*`, and removes only checkout-owned legacy Herdr adapter
links. Foreign links or locally copied legacy adapters stop migration for review.
For a targeted repair without Stow, package installs or settings changes:

```bash
node scripts/pi-tools.mjs --sync
node scripts/pi-tools.mjs --check
# Optional: verify with the actual installed adapter and Pi SDK as well.
node scripts/pi-tools.mjs --check --sdk ~/.local/lib/node_modules/@earendil-works/pi-coding-agent/dist/index.js
```

Use the SDK path for the Pi you actually run (Homebrew may install it under
`/opt/homebrew/lib/node_modules`). The script expects existing real Pi directories;
use full setup for a legacy folded-directory migration. After changing
extensions or global instructions, restart Pi sessions to load the new setup.

`settings.json`, `pi-codex-conversion.json`, and `notes-compaction/settings.json`
are writable **local files** on both platforms. Ordinary `scripts/dotfiles
stow/restow` only seeds missing files; it does not overwrite local changes.
The same seed-only rule applies to custom-tool TOMLs. To publish changes made
through Pi, deliberately update those three repository
seeds (omit credentials, theme generation state, audio device IDs, and changelog
metadata), update version pins as needed, test, and commit. Live edits do not
automatically flow back to the shared seeds.

Pi Stow rules allow only portable assets. Auth, sessions, trust, npm/model caches,
notes databases, and local LLM trees are not installed from the checkout. The
setup script can unfold old directory links owned by this checkout and detach
its config links without deleting runtime data. Existing runtime links remain
where they are; this is not a credentials/cache migration. Foreign links and
conflicting local assets stop setup for explicit migration; nothing is adopted.

Verification (isolated temporary homes, no credentials or model calls):

```bash
node --test scripts/test-pi-setup.mjs
# Optional installed-adapter tests; use your active Pi SDK path.
PI_TEST_SDK=/opt/homebrew/lib/node_modules/@earendil-works/pi-coding-agent/dist/index.js node --test scripts/test-pi-setup.mjs
bash scripts/test-macarchy-stow.sh
scripts/dotfiles doctor
```

The setup tests cover clean installs, repeated sync, old folded links, regular
tool definitions, retired adapter cleanup, local settings preservation, runtime
exclusion and conflict refusal. They do not
claim authentication, Herdr, browser, voice, or Arch runtime validation.

## Herdr App

The Herdr app rewrites the files in its home (`~/.config/herdr-app`), and its
default `keys.json` differs between macOS and Linux, so nothing there is
stowed. A script sets it up instead. It works the same on macOS and Arch:

```bash
scripts/herdr-mods install
```

Open the Herdr app first and keep it running during setup. The script then:

- clones [herdr-stuff](https://github.com/ramtinJ95/herdr-stuff), where the
  mods (tuido, nexus) live, to `~/personal/herdr-stuff` (or `HERDR_STUFF_DIR`),
  or fast-forwards an existing checkout, and links each mod into
  `~/.config/herdr-app/mods/`;
- adds each mod's `keys.json` bindings (`ctrl-f t` opens tuido, `ctrl-f e`
  nexus) and the personal bindings in `herdr-app/keys.json` (the `ctrl-f`
  prefix keys for panes, tabs and spaces) to the app's `keys.json`, keeping the
  OS's own defaults;
- links the theme-following chrome controller from `herdr-app/mods/` in this
  dotfiles checkout. Bars, sidebars and menus follow the terminal background;
  label colors adapt to the palette with at least 4.5:1 contrast;
- clones the shipped tabs mod as `focus-tabs` and gives the active tab the
  same theme accent as the terminal focus ring. If the main layout is selected,
  it clones it as `main-personal` and selects that clone; an existing custom
  main-style layout is updated in place, preserving its panels and other mods.
  The controller and tabs clone are wired into that layout automatically;
- installs Ctrl-f navigation: h/j/k/l for panes, H/L for adjacent tabs, 1–9 for
  direct tab selection, b for current-space tab search, a for the agent launcher,
  and Tab to jump back to the previous pane/agent. In the launcher, n/d jump
  directly to Needs you/Done, w shows working agents, and / starts text search;
  j/k and Enter browse/select. Counts and scope are shown. Search uses Ctrl-j/k
  or arrows and Enter; Escape returns to agent browsing (or closes tab search).
  Agent order stays stable when statuses change.
  Existing shortcuts remain available; no global OS or editor keys are remapped.
  See [`navigation/README.md`](herdr-app/mods/navigation/README.md) for the scheme;
- on Omarchy, makes the app follow the Omarchy theme and font. The arch
  `omarchy` package does the work on every switch: `themed/herdr-app.json.tpl`
  renders the colors, and the `theme-set` and `font-set` hooks install them
  and set `theme` and `font` in `settings.json`. A fresh install applied its
  theme before the app existed, so the script applies it once (stow the arch
  packages first).

The script never replaces unrelated configuration: a conflicting mod folder,
custom tab mod or controller slot makes it fail; a key you already use stays
yours, with a warning. The owned `focus-tabs` clone gets only the targeted
active-border edit; incompatible upstream tab code fails explicitly. No
generated themes, fixed palette colors or machine-local session state are
copied into dotfiles. Other layouts keep their own look; rerun setup with a
custom main-style layout selected to enable these tweaks there too.

Run it again after pulling to pick up new mods or bindings; unchanged appearance
files are not rewritten. Clones keep their original upstream implementation;
they do not automatically receive later shipped mod changes. Restart the app
after it links a new mod. To change a shared binding,
edit `herdr-app/keys.json` here and run the script; it adds new keys but won't
change a key the app's `keys.json` already binds.

Each mod's README lists what it needs: tuido needs the `tuido` CLI set up with
`tuido init`, and nexus needs `nexus connect`. Herdr stops adding new default
shortcuts to `keys.json` once the file has been edited, including by this
script.

Focused checks (no live config changes):

```bash
python3 -B scripts/test-herdr-app-look.py
node --test common-config/herdr-app/mods/terminal-chrome/palette.test.js
node --test common-config/herdr-app/mods/navigation/*.test.js
```

## Shared Agent Instructions and Skills

Cross-harness instructions live in `common-dotfiles/agents/.agents/AGENTS.md`.
Each harness keeps the filename it expects, but links back to that canonical
file:

- Pi: `.pi/agent/AGENTS.md`
- Codex: `.codex/AGENTS.md`

Claude Code's `.claude/CLAUDE.md` is a standalone per-platform copy instead.

Cross-harness skills live in `common-dotfiles/agents/.agents/skills`. Pi and
Codex load that global skill directory directly through `~/.agents/skills`; do
not add duplicate shared-skill links under `.pi/agent/skills` or `.codex/skills`.
Claude does not read `~/.agents/skills`, so the macOS and Arch Claude packages
bridge every shared skill with repo-relative symlinks from `.claude/skills`.
The Pi-packaged `visualize-code-changes` skill is also bridged directly into
both Claude packages. `scripts/dotfiles doctor` checks these bridges so a new
shared skill cannot silently remain unavailable in Claude.

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
