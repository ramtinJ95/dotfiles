# opencode-web

Global pi extension installed in `~/.pi/agent/extensions/opencode-web`.

It adds two tools inspired by OpenCode:
- `webfetch` — fetch a specific URL as markdown, text, html, or an inline image
- `websearch` — search the web through Exa's hosted MCP endpoint

## Activate

Run `/reload` in pi after editing or installing the extension.

## Notes

- `webfetch` upgrades `http://` URLs to `https://`
- large text output is truncated to pi's standard limits and the full output is saved to a temp file
- `websearch` uses `https://mcp.exa.ai/mcp`
- markdown conversion uses `turndown`
