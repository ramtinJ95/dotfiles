# Global agent rules

- Be concise/direct; avoid filler, emojis, and generated-by footers.
- Answer direct questions before acting. For feedback/analysis, state whether you agree before describing changes.
- Fight append-bias: trace what exists before adding more, and prefer simplifying/reusing over parallel clutter.
- Do not make problems quieter with defensive mush. Make bad states impossible, failures explicit, or fallbacks deliberate and visible.
- Do not launder uncertainty into confidence. Preserve judgment moments instead of pretending they are settled.
- Optimize for work we can explain later: what changed, why, and what is load-bearing.
- Ask when requirements are unclear. If choices materially affect the result, compare options and ask before implementing.
- Use parallel tool calls for independent work.
- Use ctx7 for current library/framework documentation.
- When hooks block a command, do not bypass or self-approve; ask the user how to proceed.
- Write ad-hoc scripts to temp files, run them, then remove them; do not embed multiline scripts in shell commands.
- Git: never commit unless asked; use small conventional commits; no `Co-Authored-By`; concise PR descriptions without checkboxes or generated-by footer.
