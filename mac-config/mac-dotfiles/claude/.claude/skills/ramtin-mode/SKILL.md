---
name: ramtin-mode
description: Ramtin's conventions for autonomy, delegation, verification and explanations. Use for /ramtin-mode or requests to work in Ramtin's style.
disable-model-invocation: true
---

# Ramtin mode

This skill adds to the global and workspace CLAUDE.md files. Those already cover reply style, git, Astra review and the two tailnets.

## Reading the user

The user types fast and lowercase, with typos and approximate names. Read for intent. When your reading changes what you do, state it in one line ("Taking 'intric-infra' as `intric-infrastructure`.") and carry on. When a name could mean two things, such as the intric product and the `intric` CLI, say which one you mean each time.

## Autonomy

- "Brainstorming", "designing" or "still thinking" puts the session in discussion mode. Read, investigate and propose. Change no files, and start no delegate that changes files, until the user says to build.
- A goal with an end condition is a loop grant. Examples are "until the tests pass" and "keep monitoring astra until it gets through". Iterate, fix and re-run without checking in between rounds. Stop at the end condition, a hard boundary from CLAUDE.md, or a blocker you cannot resolve, and report which one stopped you.
- When a sandbox-blocked change lands in the user's own config (`~/.claude`, `~/dotfiles`), show the user the resulting text, not only the edit command.

## Delegation

Pick the channel by where the agent runs:

- In-session subagents (the `Agent` tool) handle short read-only work whose result this thread needs, such as mapping and lookups.
- The shepherdr mod (`mcp__shepherdr__agents`) handles every agent that runs in Herdr. Use it instead of raw `herdr` commands. Call it with `{}` first for the current profiles and rules, and pass this session's workspace ID (`$HERDR_WORKSPACE_ID`) on spawn.
- Pi workers (the profiles without a `claude-` prefix) are Astra. Use `reviewer` for diff review and `general` for writes and long loops.
- Claude workers (`claude-*` profiles) run under the same sandbox as this session. Send work that the sandbox blocks for this session or a Claude worker to a pi `general` worker instead.

Rules for every delegate:

- In an unfamiliar system, map it before proposing a change. Send parallel read-only subagents, one per component or question (how the repos fit together, the release flow). Write the synthesis yourself.
- Brief every delegate so it can work without this thread. Give it the goal, why the user wants it, decisions already made, constraints, and where to report. Put a brief longer than a paragraph in a file under `$TMPDIR` and point the agent at it.
- Mark a delegate's finding as unverified unless you checked it. Before a conclusion rests on one, confirm it yourself or with a second agent.
- Spin off separable work. When a long session produces a task that can stand alone, such as its own PR, spawn a `claude-general` worker through shepherdr with `placement: "new_tab"` and `blocking: false`, then `unwatch` it. Tell the user the tab label. They follow up with it directly.

## Verification

- Done means a live check against the real system. Run the command, hit staging, or reproduce the flow, and show the evidence you saw.
- Retest the diagnosis. Before proposing a fix for a tooling, sandbox or CI failure, reproduce it and confirm the cause with a retest that isolates it. Call an untested cause a guess.
- Assume `main` works. When something that works on `main` breaks, look first at what differs locally: config, environment, versions, uncommitted changes. Propose a rollback or dependency change only after showing that `main` itself is broken.

## Explaining

- Explain the mechanism. Say how the thing works and why it behaves that way, in plain language, and define each term the first time you use it. The user is new to much of the infra stack. Then point to where it lives in the repo.
- Answer a status request ("whats going on", "status update") with these sections in order, skipping empty ones:
  - **Done.** What changed, with evidence.
  - **Delegates.** What Astra or subagents found, marked verified or unverified.
  - **Waiting on you.** Decisions or actions only the user can take.
  - **Not started.** Remaining planned work.
