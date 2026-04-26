# infra-command-guard

Global pi extension that wraps the built-in `bash` tool and asks for approval before running higher-risk `kubectl`, `terraform`, and `az` commands.

## Goals

- Keep normal `bash` behavior and rendering for allowed commands
- Add a fast in-process guard before execution
- Fail closed in non-interactive mode
- Stay separate from Claude hooks
- Allow `kubectl port-forward`, including common wrapped/backgrounded forms

## What it auto-allows

### kubectl
Low-risk diagnostics and read-style commands, including:

- `get`
- `describe`
- `logs` / `log`
- `top`
- `explain`
- `api-resources`
- `api-versions`
- `version`
- `wait`
- `diff`
- `port-forward`
- wrapped/backgrounded `kubectl port-forward` commands when the command's kubectl usage is limited to port-forward
- `auth can-i`
- `auth whoami`
- `rollout status`
- `rollout history`

### terraform
Low-risk planning and inspection commands, including:

- `fmt`
- `validate`
- `version`
- `graph`
- `providers`
- `init`
- `plan`
- `show`
- `state list`
- `state show`
- `workspace list`
- `workspace show`
- `workspace select`

### az
A narrow read-style allowlist:

- `show`
- `list`
- `get`
- `exists`
- `check`
- `wait`
- `download`
- `version`

## What requires approval

- Mutating infra commands such as `kubectl delete`, `terraform apply`, `az group delete`
- Commands the guard cannot classify safely
- Indirect shell-runner patterns such as `bash -lc "kubectl ..."` or `xargs kubectl ...`, except for commands whose kubectl usage is limited to `port-forward`
- Some sensitive read paths, e.g. `kubectl get secret ...`

## Notes

- This guards the LLM `bash` tool override, not user `!command` shell usage.
- Interactive approval uses a custom scrollable overlay instead of pi's default confirm popup.
  - `↑` / `↓` scroll
  - `PgUp` / `PgDn` or `Ctrl+u` / `Ctrl+d` page
  - `g` / `G` jump to top/bottom
  - `j` / `k` move between `No` and `Yes`
- Because it overrides the built-in `bash` tool, pi may show the standard override warning in interactive mode.
- No settings change is required; placing this folder under `~/.pi/agent/extensions/` is enough.

## Reload

Run:

```bash
/reload
```

or restart pi.
