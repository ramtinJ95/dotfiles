{
  "background": "{{ background }}",
  "foreground": "{{ foreground }}",
  "selection": "{{ selection_background }}",
  "cursor": "{{ bright_foreground }}",
  "ansi": [
    "{{ background }}", "{{ red }}", "{{ green }}", "{{ yellow }}",
    "{{ blue }}", "{{ magenta }}", "{{ cyan }}", "{{ foreground }}",
    "{{ muted }}", "{{ bright_red }}", "{{ bright_green }}", "{{ bright_yellow }}",
    "{{ bright_blue }}", "{{ bright_magenta }}", "{{ bright_cyan }}", "{{ bright_foreground }}"
  ],
  "colors": {
    "canvas": "{{ dark_background }}",
    "chrome": "{{ dark_background }}",
    "surface": "{{ background }}",
    "popover": "{{ lighter_background }}",
    "raised": "{{ mix background foreground 10% }}",
    "hover": "{{ mix background foreground 8% }}",
    "selected": "{{ mix background accent 20% }}",
    "border": "{{ mix background foreground 14% }}",
    "input": "{{ mix background foreground 24% }}",
    "ring": "{{ accent }}",
    "foreground": "{{ foreground }}",
    "terminal_foreground": "{{ foreground }}",
    "muted": "{{ mix foreground background 30% }}",
    "dim": "{{ mix foreground background 52% }}",
    "accent": "{{ accent }}",
    "accent_foreground": "{{ background }}",
    "solid": "{{ accent }}",
    "solid_foreground": "{{ background }}",
    "selection": "{{ selection_background }}",
    "working": "{{ yellow }}",
    "blocked": "{{ red }}",
    "done": "{{ blue }}",
    "idle": "{{ mix foreground background 52% }}",
    "unknown": "{{ mix foreground background 52% }}"
  }
}
