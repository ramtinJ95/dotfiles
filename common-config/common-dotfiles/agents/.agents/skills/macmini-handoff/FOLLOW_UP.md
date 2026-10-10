# Follow up on an accepted handoff

Follow only the branch the human requested. Use the recorded task directory and named remote session; an unreachable host means its status is unknown, not failed or complete.

## Check progress

Read `STATUS.json`, `PROGRESS.md`, `SUPERVISOR.json`, recent supervisor events, any report, and the actual evidence for the claimed phase. Inspect both Herdr lifecycle metadata **and the terminal screen**: an approval modal may be present while metadata says `working`. Verify supervisor/resource-watchdog PIDs, stderr, and sample freshness against their configured interval and observation timeout. Query the target's actual job/process state when the controller is waiting remotely.

Classify what is observed:

| State | Evidence |
| --- | --- |
| Active | Recent substantive work/outputs, a bounded current operation, and live supervision. |
| Waiting | A legitimate bounded operation with a known condition and deadline; not proof of useful progress by itself. |
| Idle unfinished | A live controller awaiting input while task work remains. Check whether an authorized continuation is pending or exhausted. |
| Stalled | No advancing work evidence, expired operation, or dead/stale required monitor. Say what stopped, since when, and which deadline/recovery should have caught it. |
| Blocked | An approval/question, failed prerequisite, or explicit blocker. Never call this active because a spinner/PID remains. |
| Complete | Terminal status and report agree, with the requested acceptance/results artifacts. A partial implementation or pilot is not full completion. |
| Unknown | Host unreachable, missing evidence, conflicting state, or unrecognized UI. Do not infer failure or success. |

Report actual new artifacts/results since the previous check, current operation/blocker, freshness, and remaining coverage. Distinguish diagnostics, preliminary measurements, and completed primary runs. A supervisor heartbeat is not a task-progress timestamp.

Checking status does not authorize restarting, steering, clearing dialogs, changing guard settings, or publishing a PR. Leave an already-authorized remote supervisor running; manual intervention requires the user's request. Never submit command approvals on the user's behalf. Give any required instructions for operating another interface in normal chat, not an input modal.

**Gate:** report completion only when a terminal status and readable report agree; otherwise identify the observed progress, blocker, or missing evidence. An idle terminal alone is insufficient.

## Repair or resume, only when requested

1. Confirm the existing task's authority, deadline, resource IDs, and failure evidence. New scope or expired authority needs a decision; do not silently renew it.
2. Create task-local `SUPERVISOR_PAUSED` before manually pausing/editing the controller, so automatic continuation cannot race the repair. Inspect actual UI/keybindings; do not assume Escape cancels the model rather than changing editor mode. Verify the controller acknowledged the pause before concurrent edits.
3. Repair the smallest verified cause; stop only identified owned processes. Preserve failed evidence and accepted inputs. Never bypass a guard or self-approve, even if it interrupts autonomous operation.
4. Verify the repaired path with real output assertions, actual child/container resource limits, and advancing monitor samples. Preserve supervisor attempt counters; an operator-approved new recovery budget must be explicit, not achieved by deleting state.
5. Return ownership to the **same Mac mini controller**, update task/repair evidence, clear the pause marker only after the agreed continuation is ready, and observe a genuine next operation. No new controller or laptop-dependent loop unless the user explicitly requests it.

**Gate:** report restored autonomy only after supervision, deadlines, and actual progress are verified. Otherwise state the remaining blocker; do not substitute “process alive” for “working independently.”

## Add supplemental evidence

Transfer optional evidence to a fresh `supplements/<revision>/` directory with its own checksums. Leave accepted inputs unchanged, verify both manifests, and notify the controller at a natural checkpoint that the supplement adds no runtime dependency or restart requirement. A failed optional transfer does not revoke the accepted handoff.

**Gate:** supplement hashes and the original manifest pass, or delivery is explicitly reported unsuccessful; the existing investigation remains independent.

## Retrieve results

Copy the report, status, final patch/source manifest, and requested evidence into a separate local results directory. Verify transferred hashes. The remote controller may have changed the candidate after handoff: compare revisions before proposing local application, and leave the current working tree untouched until authorized.

**Gate:** verified results are available locally, differences from the original candidate are identified, and retained remote resources are recorded. Further investigation, cleanup, or publication requires its own authorization.
