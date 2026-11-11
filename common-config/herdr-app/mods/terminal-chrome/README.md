# Terminal-matched chrome

Keeps bars, sidebars, menus and base surfaces on the active terminal background.
Label colors are derived from the terminal foreground with at least 4.5:1
contrast. Theme hue, terminal colors, accents, hover and selection are preserved.
Works with built-in themes and watched custom palettes, including Macarchy.

Herdr 0.1.15 accepts only literal `settings.json.colors`, so this controller
updates those values on live theme changes, not on a polling timer. Writes use
Herdr's compare-and-swap file API and preserve unrelated settings. Failures show
an error notification rather than silently overwriting concurrent edits.

Installed and enabled by dotfiles' `scripts/herdr-mods install`. For manual
installation, link this folder into `~/.config/herdr-app/mods/terminal-chrome`,
then add a nonvisual floating slot to a **custom** layout's `floating` array:

```json
{
  "id": "terminal-chrome",
  "content": { "mod": "terminal-chrome", "props": { "enabled": true } },
  "edge": "bottom",
  "align": "end"
}
```

The controller must be mounted in each layout where you want this behavior;
explicit layout color overrides can take precedence. Checking or opening the mod
alone does not change settings. After source updates to a linked mod, reopen the
layout to reload it. To uninstall, remove the floating slot and remove its owned
colors (`canvas`, `chrome`, `surface`, `popover`, `raised`, `foreground`, `muted`,
`dim`, `idle`, `unknown`) from `settings.json.colors`.
