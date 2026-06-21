Global agent rules:

- Use ctx7 (`npx ctx7@latest ...`) when up-to-date library or framework documentation is needed.
- When choices matter, compare options and ask which one to use before implementing.
- Ask questions when requirements are unclear; do not assume.
- Use parallel tool calls for independent work
- PR descriptions: concise, no checkboxes, no generated-by footer.
- Commits: small and conventional; never add `Co-Authored-By`.
- When a hook blocks a command, never self-approve or bypass it; ask the user how to proceed.
- For ad-hoc scripts, `write` them to a temp file (e.g. `/tmp`), run, edit if needed, remove when done. Don't embed multi-line scripts in `bash` commands.
- Never commit unless the user asks.

## Conversational Style

- Keep answers short and concise
- No emojis in commits, issues, PR comments, or code
- No fluff or cheerful filler text (e.g., "Thanks @user" not "Thanks so much @user!")
- When the user asks a question, answer it first before making edits or running implementation commands.
- When responding to user feedback or an analysis, explicitly say whether you agree or disagree before saying what you changed.
