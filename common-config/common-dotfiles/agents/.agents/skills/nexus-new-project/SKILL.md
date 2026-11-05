---
name: nexus-new-project
description: Start a new project on Nexus, with a pylon building its first version and private GitHub repository, then add it as a project with auto-review on.
disable-model-invocation: true
argument-hint: "<idea> [repo: owner/name] [stack: ...]"
---

Start a new project on Nexus, with a Nexus pylon building its repository, not this Mac.

Input: $ARGUMENTS (in Pi, the request that follows these instructions)

From it, take the **idea** (what it is and who it's for), the **repository** (`<owner>/<name>`) and the **stack**. If the idea or the repository is missing, ask for it before anything else. A missing stack is your call; say what you picked.

A scratch project never becomes a repository project: its threads always start from an empty `git init`, and `project edit` can't add a repository URL. So the bootstrap runs in a scratch project, and the real project is added once the repository exists.

## Steps

1. **Read the CLI contract.** Read ~/personal/nexus/docs/cli.md (Commands, Project editing, Reviews and landing, Claude conversations) so you use the CLI as it is today, not from memory. If that file is missing, use `nexus --help`. Done when you know the exact `project add`, `project edit`, `start` and archive syntax.

2. **Copy the grants.** Run `nexus projects --json` and read the `nexus` project's logins, secret grants, allowed hosts and git identity. The new projects get the same, so their agents can publish to GitHub, run Claude and use the pi reviewer. Add any registry host the stack needs with `--allow-host`. Show me the exact `project add` commands and wait for my go. Done when I've approved them.

3. **Add the scratch project** `<name>-scratch` with those grants and `--scratch`, then set the same git identity with `project edit`. Done when `nexus projects` lists it with every grant.

4. **Start the bootstrap thread.** Start one Claude worker thread in the scratch project, titled `bootstrap <name>`, with the brief below, its placeholders filled in. Done when the thread is working.

5. **Watch it.** Wait until the thread replies. Answer its questions only if they're about this setup; ask me anything about the product. Done when the repository exists on GitHub, is private, and holds CLAUDE.md, AGENTS.md and the `.nexus` files.

6. **Add the real project** `<name>` from `https://github.com/<owner>/<name>.git` with the same grants and git identity. Turn on auto-review with `nexus project edit <name> --auto-review review`, so every pull request a builder opens is reviewed by the other model family and checked with `.nexus/check`. Don't start a thread in it. Archive the bootstrap thread; don't delete it. Done when `nexus projects` shows the project with its grants and auto-review on, and the bootstrap thread is archived.

7. **Report**: the repository URL, both projects and their settings, what the bootstrap agent built and verified, what it couldn't check, and a suggested brief for the first real thread.

Stop and ask me if a grant or secret is missing on the node, if `gh repo create` fails, or before anything that deletes.

## The bootstrap brief

```
Build the first working version of this idea in /home/user/workspace/repo: <idea>. Stack: <stack>. Keep it small: one thing that runs end to end, with tests.

Then make the repository ready for agents that will work on it later:
- CLAUDE.md, symlinked as AGENTS.md: what the project is, how to run, test and typecheck it, its conventions, and what "done" means for a change.
- .nexus/setup (installs dependencies once, as user, POSIX sh, executable), .nexus/resume (runs on every wake; reinstalls only when the lockfile changed), .nexus/check (the check a pull request must pass: install, typecheck, full tests, nonzero on failure), and .nexus/services.yaml if it has a dev server, with a preview.
- Use the Nexus repository's own .nexus/setup, resume and check as the reference: clone https://github.com/ramtinJ95/nexus read-only into /tmp to read them. Don't copy Nexus-specific parts.
- Run .nexus/setup and .nexus/check yourself and make them pass. The review loop runs .nexus/check on every pull request, so it must fail when the code is broken.

Commit in small conventional commits, then publish as a private repository with
`gh repo create <owner>/<name> --private --source . --remote origin --push`.
Have a shepherdr reviewer check the diff before the push, as PYLON.md says. Reply with the repository URL, what you built, how you verified it, and anything you couldn't check.
```
