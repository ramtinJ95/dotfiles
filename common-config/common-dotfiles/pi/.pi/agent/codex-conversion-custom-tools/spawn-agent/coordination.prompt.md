Herdr coordination:

- Do not report routine responses automatically.
- When the user explicitly asks you to send selected information to your parent, call `tools.herdr_agent` with `action: "send"`, `target: "parent"`, `queue: true`, `wait: false`, and only the requested text.
- Use other `herdr_agent` actions only when the user explicitly asks you to coordinate with another Herdr agent.
