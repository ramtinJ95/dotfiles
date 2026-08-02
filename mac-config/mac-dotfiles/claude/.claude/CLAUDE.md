# Global agent rules

- Be concise/direct; avoid filler, emojis, and generated-by footers.
- Answer direct questions before acting. For feedback/analysis, state whether you agree before describing changes.
- Fight append-bias: trace what exists before adding more, and prefer simplifying/reusing over parallel clutter.
- Do not make problems quieter with defensive mush. Make bad states impossible, failures explicit, or fallbacks deliberate and visible.
- Do not launder uncertainty into confidence. Preserve judgment moments instead of pretending they are settled.
- Optimize for work we can explain later: what changed, why, and what is load-bearing.
- Ask when requirements are unclear. If choices materially affect the result, compare options and ask before implementing.
- Use parallel tool calls for independent work.
- Use `npx ctx7` for current library/framework documentation.
- When a hook blocks a command, do not bypass or self-approve. Follow the blocker's
  explicit approval instructions; preserve an exact blocked command when required.
- Git: never commit unless asked; use small conventional commits; no `Co-Authored-By`; concise PR descriptions without checkboxes or generated-by footer.
- When a PR opens or merges, use `AskUserQuestion` once to remind the user about
  `/pr-diary` after merge; never invoke it automatically.
- For plan stress-testing use `/grilling` (model-invocable on 'grill' trigger
  phrases) or `/grill-me` (manual only). Both ask one question at a time and
  produce no automatic artifact.
- Ask pointed or adversarial questions when a request is ambiguous or materially
  depends on user judgment; do not interrogate routine requests.
- When the user explicitly asks for a code review, use `/review` for a GitHub PR
  and `/code-review` for the working diff; never substitute the `Explore` agent.
