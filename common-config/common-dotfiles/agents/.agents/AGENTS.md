# Global agent rules

## Response style

- Be concise and direct.
- For technical work, use technical prose only.
- Avoid filler, emojis, and generated-by footers.
- Answer direct questions before taking action.
- When responding to feedback or analysis, state whether you agree before describing changes.

## Work process

- Before adding new behavior, fight append-bias: trace the owning entrypoint/call chain, look for existing specialized code, and prefer reusing/removing/refactoring over adding parallel logic.
- Ask questions when requirements are unclear.
- When choices materially affect the result, compare options and ask before implementing.
- Use parallel tool calls for independent work.
- Use ctx7 for current library/framework documentation.
- When hooks block a command, do not bypass or self-approve; ask the user how to proceed.
- Write ad-hoc scripts to temp files, run them, then remove them. Do not embed multiline scripts directly in shell commands.

## Git

- Never commit unless asked.
- Use small conventional commits.
- Do not add `Co-Authored-By`.
- PR descriptions should be concise, with no checkboxes or generated-by footer.
