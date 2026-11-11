# Looks: work or café

Open **Choose a look** with **Ctrl-f r**. Only three modes are listed:
Work (`main-personal`, or `main`), Cosy Cabin (`cabin`) and Cosy Café (`cosy`).
`j`/`k` or arrow keys move, Enter applies, Escape cancels. Selecting a café uses its warm
`cosy` palette; selecting Work uses the installed Omarchy/Macarchy palette.
Herdr's other defaults and old layout copies stay out of this picker.
The Cosy layout's installer supplies its
palette; a missing palette is an explicit error, not a dark fallback.

`scripts/herdr-mods install` installs this mod and merges its global shortcut.
For a targeted install, copy this directory to
`~/.config/herdr-app/mods/appearance` and merge the `ctrl-f r` binding from
`common-config/herdr-app/keys.json`. Never edit Herdr's shipped layouts/mods.

The shared Pi extension `herdr-appearance` follows Herdr's documented
`shared("layout")` state. In Cosy/Cabin it applies an in-memory warm palette:
espresso tool panels, cream output, and readable nested `dim` text (at least
4.5:1 contrast against every panel). On returning to Work it reloads Pi's
original native theme from disk, including any palette changes made while relaxing,
and continues watching that source in work mode. It never saves the warm palette as Pi's
global preference or edits generated palettes. The state file is checked once
per second, only in interactive Pi sessions with `HC_TERMINAL_ID`; terminals
outside Herdr keep their selected theme. Reload/restart existing Pi sessions
after installing the extension.

```sh
node --test scripts/test-herdr-appearance.mjs
herdr-app check common-config/herdr-app/mods/appearance
```
