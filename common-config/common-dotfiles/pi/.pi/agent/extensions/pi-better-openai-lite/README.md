# pi-better-openai-lite

Local minimal Pi extension based on `mattleong/pi-better-openai`.

Included features only:

- `/fast` toggle for OpenAI `service_tier: "priority"` on configured supported models.
- `/openai-usage` for OpenAI subscription usage windows.
- `/openai-settings` for fast/usage settings.
- Footer status line showing OpenAI usage limits.

Excluded from upstream intentionally: image tools, pets, custom full-footer replacement, extra commands, and CLI flags.

Config is stored at `~/.pi/agent/extensions/pi-better-openai-lite.json` by default. A project override can be placed at `.pi/extensions/pi-better-openai-lite.json`.
