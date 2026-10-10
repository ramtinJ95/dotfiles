---
name: macmini-handoff
description: Hand off tasks to an independent Mac mini controller working on infra-testbench.
disable-model-invocation: true
---

# Mac mini handoff

Human-invoked only. Proceed when the user explicitly invokes or names `macmini-handoff`; another agent or skill cannot invoke it.

The deliverable is **independent, supervised execution**: the Mac mini owns implementation, validation, recovery, and reporting after this machine disappears. A surviving process, an acceptance receipt, and a `working` label do not prove progress. Unexpected approval requirements may still block work; never promise guaranteed completion or bypass a guard to preserve that promise.

Use one interactive controller and one non-agent progress supervisor. The laptop is not a scheduler, repair loop, or required source of next-step prompts. A resource watchdog is separate from progress supervision: fresh CPU samples do not prove useful work.

For a requested check-in, supplement, or result retrieval on an existing handoff, read [FOLLOW_UP.md](FOLLOW_UP.md) and follow only that branch. For a new handoff, complete the gates below in order.

## 1. Establish scope and access

Recover the goal, decisions, rejected approaches, and acceptance criteria from the conversation. Establish task-specific autonomy bounds; ask only for missing decisions:

- Permitted implementation changes, tests, builds, dependency setup, and reruns.
- CPU, memory, swap, disk/evidence budgets, overall deadline, and stop conditions.
- Per-operation and no-progress deadlines, retry limits, and permission for bounded automatic continuation of the **same idle controller**. This does not authorize approval responses, new agents, or new scope.
- Which resources may be created and cleaned up, and which must remain untouched.
- Publication authority. Default: preserve a patch; no commit, push, PR, merge, or deployment. Further agents require explicit delegation.

Previous investigations supply evidence, not permissions or resource allocations.

Resolve the current SSH aliases and verify both hops with bounded, read-only commands:

```bash
ssh -o BatchMode=yes -o ConnectTimeout=8 macmini 'hostname; command -v herdr; command -v pi; command -v git; command -v task; command -v uv'
ssh -o BatchMode=yes -o ConnectTimeout=8 macmini 'ssh -o BatchMode=yes -o ConnectTimeout=8 infra-testbench hostname'
```

If an alias fails, inspect its SSH configuration or narrowly filtered Tailscale peer metadata before asking for a hostname. Keep network/authentication configuration unchanged. Resolve missing tools through the approved isolated setup, not global installation.

Preflight the actual planned tool paths, not just executable presence. Verify authentication from the remote controller, representative safe test/build commands, target runtime access, and expected approval requirements while the user is available. Record expiring sessions, temporary permission changes, and their effect on the authorized unattended window. Broad task permission does not satisfy a later command-specific approval. Never change or pause guards yourself.

**Gate:** both hops work, autonomy and continuation bounds are explicit, and every known tool/access/approval gap has a resolution. Otherwise report what prevents unattended execution.

## 2. Freeze a self-contained handoff

Use a fresh task ID and dedicated Mac mini directory, normally `~/workspace/handoffs/<task-id>/`, with an isolated clone/worktree or exported tree. Preserve existing checkouts, which may be older or dirty.

Coordinate a snapshot with the current implementation owner. Capture the exact base, branch, tracked changes, required untracked files, deletions, binaries, and executable permissions while edits are frozen. A plain `git diff` omits new tests. Incomplete implementation can be handed off with its remaining work explicit.

Use a self-contained Git bundle only if its history is appropriate to share; otherwise export allowlisted sources with base provenance. Exclude credentials, `.env.secret`, customer content, developer environments, session histories, and unrelated files. Reject archive traversal, unexpected absolute paths, and escaping symlinks before extraction.

Prepare outside the product repository:

| Artifact | Required content |
| --- | --- |
| `HANDOFF.md` | Goal, autonomy bounds, plan, acceptance criteria, rejected alternatives, open judgments, access facts, and the controller contract below. This is the authority; label obsolete instructions in historical reports accordingly. |
| Source inputs | Baseline/candidate, fixtures or generators, lockfiles, repository instructions, synthetic configuration, and portable setup/test commands. State whether patches are already applied. |
| `IMPLEMENTATION.md` | Implemented behavior, observed red/green results, incomplete checks, side effects, and remaining work. Separate measurements from historical claims and hypotheses. |
| Evidence | Sanitized logs and measurements with provenance, including failed runs. |
| Runtime supervision | Copy this skill's `scripts/supervisor.py`, `scripts/run_supervisor.sh`, and `scripts/test_supervisor.py` into task-local `commands/`; include their hashes in transferred inputs. Record launcher, log, resource-watchdog, and recovery ownership. |
| `SHA256SUMS` | Relative-path checksums for transferred inputs; a separate source manifest for the resulting candidate tree. |

Include this **controller contract** in `HANDOFF.md`:

- Own **all** remaining in-scope implementation, validation, analysis, and reporting. A milestone is a checkpoint, not a final turn. Immediately continue the next unfinished step; compact context with an on-disk checkpoint when needed. End only at completion, a genuine blocker, or the deadline.
- Verify the target host and actual execution endpoint, including the Docker daemon when used. Inventory nonsecret metadata and preserve unrelated workloads. Label owned resources, record exact IDs, and clean up only those IDs.
- Apply the agreed aggregate budgets to setup/build tools, workloads, observers, logs, and temporary storage. Inspect actual process/container cgroup membership: constraining a daemon does not necessarily constrain its containers. Verify monitor permissions again after privileged runtime files exist. Missing/stale monitors stop new heavy work until repaired within scope. Use synthetic data and isolated services.
- Preserve commands, source/fixture hashes, configuration, failures, and red/green evidence. Separate diagnostic runs from primary measurements; an inconclusive result is valid.
- Keep atomic `STATUS.json` and `PROGRESS.md` checkpoints, actual evidence, current operation/deadline, and the next step. Update after a phase or failure; do not leave only the initial START entry. Supervisor heartbeats and rewritten timestamps are not work evidence.
- Apply the bounded-execution rules below. Reach a minimal real end-to-end acceptance check early, before bulk work. Assert the required result, not just process health or a success flag. For measurement tasks, produce a small valid comparison and raw results before expanding the matrix; label its limited coverage.
- When permissions, safety, dependencies, or the deadline prevent continuation, record `BLOCKED`, the exact unmet prerequisite, failed attempts, partial results, and retained resources. Never bypass or self-approve a blocked command. Inspect `SUPERVISOR.json` at checkpoints and investigate attention states rather than suppressing them.
- Finish with `REPORT.md`, terminal `STATUS.json`, raw evidence, final patch/source manifest, and cleanup/retained-resource records. Do not mark the whole task complete because implementation or a pilot finished. Keep the interactive session and reproducibility artifacts available.

**Gate:** the frozen snapshot accounts for every required input and reproduces the candidate without source-only paths. Record its hashes, location, and known limitations locally.

## 3. Bootstrap a persistent interactive controller

Read [the Herdr skill](../herdr/SKILL.md) for environment, pane, and agent-control rules. Check installed Herdr/Pi CLI support. Use a unique named session on the Mac mini and scope remote commands to it; remote pane IDs can collide with local ones.

**Default the controller to Astra (`gpt-6-astra`) with the configured provider.** Read the remote Pi defaults rather than overriding them with another model. A different model requires an explicit user request; if Astra is unavailable, report that instead of silently substituting. Verify the active model in the session before START and record it in the handoff receipt.

Launch through an owned viewing pane using the remote binary, avoiding client/server version mismatch:

```bash
ssh -tt -o BatchMode=yes macmini 'herdr --session <session>'
```

Discover the remote shell pane, set its task directory, and start a named interactive Pi agent there. The remote Herdr server owns its lifetime; the SSH client is only a viewer. Report interactive startup failures rather than falling back to headless execution.

Give **PREPARE ONLY, await START** instructions. Permit only the harmless supervision rehearsal described below before START. Require a model response and harmless local tool call to prove authentication and execution, then have it read applicable instructions and identify missing inputs.

**Gate:** the remote model/tool check passed, session and agent identifiers are recorded, and no workload has started.

## 4. Transfer and verify

Transfer with connection/keepalive limits, an overall deadline, and byte/file progress checks. Keepalives alone miss stalled SFTP. On a stall, stop the owned transfer and permit at most one documented alternate attempt, such as `scp -O`, within the same bounds; otherwise report blocked.

Verify all input checksums on the Mac mini, materialize the isolated sources, and verify the candidate manifest. Keep these accepted originals immutable. Have the controller read the handoff and resolve missing inputs before START.

Prove persistence: close only this task's temporary SSH viewer, reconnect through fresh SSH, and verify the same remote Pi session survives. Leave its server and controller running.

**Gate:** both manifests pass, the controller identifies no missing inputs, and disconnect survival is verified. Any external runtime downloads/authentication are declared and independent of this machine.

## 5. Install supervision and rehearse recovery

The controller owns `STATUS.json` from preparation onward. Use this shape, with real task-specific values and atomic replacement:

```json
{
  "status": "RUNNING",
  "phase": "validation",
  "progress_seq": 3,
  "progress_summary": "First integration check passed; starting the bounded batch.",
  "evidence": ["evidence/integration.log"],
  "operation": {
    "id": "validation-attempt-1",
    "deadline_at": "2026-01-01T12:05:00Z"
  },
  "next_step": "Inspect batch results and continue the remaining checks."
}
```

Allowed task states: `RUNNING`, `PAUSED`, `BLOCKED`, `COMPLETE`. Omit `operation` between commands. Each new attempt has a new ID and a fixed deadline within the task budget; do not extend the deadline in place. Evidence paths are task-relative real outputs, never heartbeat/status files. Use sanitized logs with real progress signals; repeated error lines are not progress. The supervisor fingerprints file size and tail bytes, not timestamp/sequence churn; it cannot judge semantic correctness.

Launch the task-local supervisor in a dedicated **ordinary Herdr pane**, with retained stdout/stderr, using the bounded-restart launcher. This is not another coding agent. Do not start it as an orphaned background tool subprocess. Record its pane/PID, native controller session identity, flags, and log paths. Example, using the actual recorded identities and UTC deadline:

```bash
bash commands/run_supervisor.sh \
  --root "$TASK_ROOT" --session "$HERDR_SESSION" \
  --agent "$CONTROLLER_NAME" --agent-session "$CONTROLLER_SESSION_PATH" \
  --deadline "$DEADLINE_UTC" --allow-resume
```

Use `--allow-resume` only with explicit task-level authorization. Defaults: 20-second sampling, 60-second idle grace, 300-second stale-evidence limit, 1,800-second maximum operation, two continuation attempts without new evidence, ten attempts overall. Set task-appropriate approved values; do not silently increase them after a failure. Budgets survive supervisor restart. The launcher permits at most three process starts and retains counters; it never restarts the controller.

The supervisor writes `SUPERVISOR.json` and `SUPERVISOR.events.jsonl`, not the controller's status. It rechecks identity, lifecycle, task state, and pause state before sending a normal continuation prompt. Approval/unknown states receive no input. Known approval-dialog evidence overrides a stale Herdr `working` label. A successful prompt means `RESUMING`, not verified progress. This helper **does not kill hung commands, enforce resource limits, approve commands, or prove task correctness**; bounded runners and resource watchdogs remain mandatory.

Before releasing the laptop:

1. Run `PYTHONDONTWRITEBYTECODE=1 python3 -m unittest discover -s commands -p test_supervisor.py` in the remote task directory. In a harmless `handoff-rehearsal` phase, have the controller write evidence, deliberately end a turn with work remaining, then let the supervisor prompt it to perform a second harmless checkpoint. Observe the second real tool action and changed evidence—not just the prompt acknowledgment. Keep product execution gated on START.
2. Verify bounded command handling with a harmless immediate failure and a timed-out owned process. Terminal failure must end the wait immediately; timeout must actually terminate that process, including a remote child if used. Never kill the controller as a rehearsal.
3. Interrupt only the supervisor child once and verify the launcher restarts it with counters intact. Check retained stderr and fresh samples. After runtime setup creates protected files, repeat the resource-monitor read/permission check.
4. Close only owned temporary SSH viewers; reconnect and prove controller, supervisor/launcher, and resource watchdogs survive and continue independently. Test the planned interactive input mode; do not assume Escape, Enter, or a lifecycle label has identical meaning in every agent/editor mode.

**Gate:** record these checks in `SUPERVISION_VERIFIED.json`, including identities, thresholds, observed recovery/evidence, monitor freshness, and source-machine independence. If automatic continuation is declined or cannot be proven, label the handoff **observe-only / not proven unattended**; do not use the full release claim below.

## 6. Transfer ownership and release the user

Send **START**: independently verify inputs, write `HANDOFF_ACCEPTED.json`, then continue the task—not just acknowledge receipt. Require:

- `status: ACCEPTED`, timestamp, task ID, exact base/source identities, and applied-patch state.
- Verified input/source manifests and their hashes.
- `missing_source_inputs: []` and `source_machine_dependency: false`.
- Herdr session, agent, task directory, report/status/evidence paths, and target host.
- Supervisor identity/paths, recovery authority and thresholds, rehearsal receipt, current phase, next operation, and deadlines.

**Gate:** read both receipts, verify fresh supervision/resource samples, inspect the actual terminal for unresolved questions, and observe a real post-START operation plus advancing task evidence. Do not release on a receipt, live PID, heartbeat, prompt acknowledgment, or `working` label alone. Resolve acknowledgment-only stops and known approval dependencies first. After this gate the Mac mini is the controller; do not make the laptop its recurring repair/steering loop.

Then give the Mac mini session/result path and say:

**“Handoff complete—safe to switch this machine's tailnet.”**

State the current phase and what has **not** run yet. This means independence and recovery checks passed, not that the implementation works, measurements are complete, or future blockers are impossible.

## Bounded execution throughout the task

- Give every transfer, build, migration, rollout, test, and workload an overall deadline and a task-appropriate no-progress bound. Keepalives and repeated polling are not progress.
- Inspect terminal states as well as success states. A failed job or nonzero command ends its wait immediately; do not wait out a success-only timeout. Preserve stdout/stderr and the exact failed attempt before retrying.
- Use a process/service/job boundary that can actually stop **owned** work. Timing out an SSH client does not stop its remote child. Record resource IDs, enforce termination remotely, and verify it. Runtime/job deadlines remain necessary even if the controller or supervisor crashes.
- Diagnose before retrying; bound attempts per failure and preserve the reason for each change. Repeating the same failure with a new timeout is not recovery. On exhaustion, write partial results and `BLOCKED` rather than looping indefinitely.
- Validate effective runtime configuration from the consuming code/process, not the apparent meaning of strings or declared manifests. Check real database/storage/queue connectivity and the smallest end-to-end output contract before increasing load.
- Freeze source/image/config identities before comparisons; write incremental raw results and summaries as each run completes. Account for failed/unfinished work and client backlog. A pilot is evidence, not completion of a larger requested matrix.
- Use only task-local scripts and dependencies. Write scripts as files rather than embedding large programs in shell strings; retain useful reproducibility scripts and follow guard instructions for any cleanup. Never rephrase a blocked command to evade approval.
