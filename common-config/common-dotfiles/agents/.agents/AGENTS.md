# Global agent rules

- Be concise/direct; avoid filler, emojis, and generated-by footers.
- Answer direct questions before acting. For feedback/analysis, state whether you agree before describing changes.
- Before adding new behavior, fight append-bias: trace the owning entrypoint/call chain, look for existing specialized code, and prefer reusing/removing/refactoring over adding parallel logic.
- Ask when requirements are unclear. If choices materially affect the result, compare options and ask before implementing.
- Use parallel tool calls for independent work.
- Use ctx7 for current library/framework documentation.
- When hooks block a command, do not bypass or self-approve; ask the user how to proceed.
- Write ad-hoc scripts to temp files, run them, then remove them; do not embed multiline scripts in shell commands.
- Git: never commit unless asked; use small conventional commits; no `Co-Authored-By`; concise PR descriptions without checkboxes or generated-by footer.
