# infra-command-guard

Global pi extension that wraps the built-in `bash` tool and intercepts `exec_command`, asking for approval before running higher-risk `kubectl`, `terraform`, and `rm` commands.

## Goals

- Keep normal `bash` behavior and rendering for allowed commands
- Guard the `exec_command` developer tool used by API-style Pi sessions
- Add a fast in-process guard before execution
- Fail closed outside TUI mode
- Stay separate from Claude hooks
- Allow `kubectl port-forward`, including common wrapped/backgrounded forms
- Mirror the Claude hook flow: block first, have the model call an approval tool with a plain-language explanation, then allow one exact retry only if approved

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

## What requires approval

- Mutating infra commands such as `kubectl delete` and `terraform apply`
- `rm` commands
- Commands the guard cannot classify safely
- Indirect shell-runner patterns such as `bash -lc "kubectl ..."` or `xargs kubectl ...`, except for commands whose kubectl usage is limited to `port-forward`
- Some sensitive read paths, e.g. `kubectl get secret ...`

## Approval flow

1. The wrapped `bash` tool or `exec_command` preflight blocks the command and returns instructions to the model.
2. The model must call `approve_infra_command` with:
   - the exact blocked command
   - the guard reason
   - a structured summary of what the command does
   - important flags/options and what they change
   - the concrete blast radius
3. Pi opens a scrollable overlay with one consistent layout: command, guard reason, summary, flags/options, blast radius, then `Cancel` / `Approve and run`.
4. If approved, the extension records a one-time approval for that exact command string.
5. The model retries the exact same shell command; the guard consumes the approval and runs it.

If the command changes by even one byte, the retry is blocked again.

## Notes

- This guards the LLM `bash` tool override, not user `!command` shell usage.
- Interactive approval uses a custom scrollable overlay instead of pi's default confirm popup.
  - `↑` / `↓` scroll
  - `PgUp` / `PgDn` or `Ctrl+u` / `Ctrl+d` page
  - `g` / `G` jump to top/bottom
  - `j` / `k` move between `Cancel` and `Approve and run`
- The model supplies structured fields rather than a markdown blob, so the UI avoids repeating command/reason/blast-radius text.
- Because it overrides the built-in `bash` tool, pi may show the standard override warning in interactive mode.
- No settings change is required; placing this folder under `~/.pi/agent/extensions/` is enough.

## Reload

Run:

```bash
/reload
```

or restart pi.
