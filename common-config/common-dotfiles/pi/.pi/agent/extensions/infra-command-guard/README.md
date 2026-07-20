# infra-command-guard

Global pi extension that wraps the built-in `bash` tool and intercepts direct and GPT-5.6 Code Mode `exec_command` calls, asking for approval before running higher-risk `kubectl`, `terraform`, and `rm` commands.

## Goals

- Keep normal `bash` behavior and rendering for allowed commands
- Guard the `exec_command` developer tool used by API-style Pi sessions
- Guard nested `tools.exec_command(...)` calls after Code Mode resolves their runtime arguments
- Fail closed at the outer Code Mode `exec` call if its nested provider cannot be guarded
- Add a fast in-process guard before execution
- Fail closed outside TUI mode
- Stay separate from Claude hooks
- Allow `kubectl port-forward`, including common wrapped/backgrounded forms
- Mirror the Claude hook flow: block first, have the model call an approval tool with a plain-language explanation, then allow one exact execution-context retry only if approved

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
- Wrapped or path-qualified `rm` commands such as `sudo rm`, `env rm`, and `/bin/rm`
- Commands the guard cannot classify safely
- Indirect shell-runner patterns such as `bash -lc "kubectl ..."` or `xargs kubectl ...`, except for commands whose kubectl usage is limited to `port-forward`
- Some sensitive read paths, e.g. `kubectl get secret ...`

## Approval flow

1. The wrapped `bash` tool or direct/nested `exec_command` preflight blocks the command and returns a pending approval request identifier to the model.
2. The model must call `approve_infra_command` with:
   - the pending approval request identifier
   - the exact blocked command
   - the guard reason
   - a structured summary of what the command does
   - important flags/options and what they change
   - the concrete blast radius
3. Pi opens a scrollable overlay with one consistent layout: command, guard reason, summary, flags/options, blast radius, then `Cancel` / `Approve and run`.
4. If approved, the extension records a one-time approval for that exact execution context.
5. The model retries the exact same shell call; the guard consumes the approval and runs it.

Approvals expire after ten minutes. If the command, working directory, requested shell, TTY mode, login mode, or tool path changes, the retry is blocked again.

The request identifier is optional in the runtime schema only so a session reloaded from the older tool schema can finish one already-visible approval flow. It is inferred only when exactly one pending request matches the exact command and reason; ambiguous calls are rejected.

## Code Mode integration

The current integration wraps Code Mode's in-process nested `exec_command` provider. The wrapper resolves dynamic JavaScript before applying the guard, so commands assembled at runtime are covered without parsing the outer JavaScript source.

This adapter uses `pi-codex-conversion` internals until that package exposes a supported nested-tool preflight API. The guard installs the wrapper at session/turn startup and verifies it again before every outer `exec` or `wait`. If an update changes those internals, the outer Code Mode call is blocked with a compatibility error instead of silently running unguarded.

## Notes

- This guards the LLM `bash` tool override, not user `!command` shell usage.
- Interactive shell/interpreter sessions requested with `tty=true` are denied rather than approvable because later `write_stdin` input cannot be classified reliably. Run complete non-interactive commands instead.
- Code Mode TOML custom tools execute their configured programs directly and are trusted capabilities outside this `exec_command` guard.
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

## Tests

From this directory:

```bash
NODE_PATH="$(npm root -g):$(npm root -g)/@earendil-works/pi-coding-agent/node_modules" bun index.test.ts
```
