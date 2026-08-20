# Global agent rules

- Be concise/direct; avoid filler, emojis, and generated-by footers.
- Answer direct questions before acting. For feedback/analysis, state whether you agree before describing changes.
- Fight append-bias: trace what exists before adding more, and prefer simplifying/reusing over parallel clutter.
- Do not make problems quieter with defensive mush. Make bad states impossible, failures explicit, or fallbacks deliberate and visible.
- Do not launder uncertainty into confidence. Preserve judgment moments instead of pretending they are settled.
- Optimize for work we can explain later: what changed, why, and what is load-bearing.
- Ask when requirements are unclear. If choices materially affect the result, compare options and ask before implementing.
- Use `ask` only to collect decisions or input the user can provide inside its modal. Do not use it to instruct the user to perform actions—such as running Pi commands, using the terminal, or operating another interface. Give those instructions in normal chat and end the turn so the user can act.
- Use parallel tool calls for independent work.
- Use ctx7 for current library/framework documentation.
- When a hook blocks a command, do not bypass or self-approve. Follow the blocker's
  explicit approval instructions; preserve an exact blocked command when required.
- Write ad-hoc scripts to temp files, run them, then remove them; do not embed multiline scripts in shell commands.
- Git: never commit unless asked; use small conventional commits; no `Co-Authored-By`; concise PR descriptions without checkboxes or generated-by footer.
- always draw diagrams where possible in the session using render_mermaid tool
- When a PR opens or merges, use `ask` once to remind the user about
  `/skill:pr-diary` after merge; never invoke it automatically.
- For plan stress-testing, choose deliberately: `/grill` batches decisions and keeps
  a plan in `docs/`; `grilling` / `grill-me` asks one question at a time without an
  automatic artifact.
- Ask pointed or adversarial questions when a request is ambiguous or materially
  depends on user judgment; do not interrogate routine requests.
- When the user explicitly asks for a code review, use the reviewer agent through
  `spawn_agent`; never substitute the explorer agent or invoke the reviewer for
  other tasks.
- The worker agent is strictly user-invoked. Use `agent_type: "worker"` only when
  the user explicitly asks to delegate work to a subagent (for example, to keep
  the main conversation context clean), and set `user_requested: true`. Never
  choose the worker proactively, even when delegation would save context or time.
- The worker agent always runs interactive. Keep `interactive: true` (or omit it)
  for worker spawns; only set `interactive: false` when the user explicitly asks
  for a non-interactive/headless worker. Never use `interactive: false` as a
  retry fallback after interactive startup failures—report the failure instead.
