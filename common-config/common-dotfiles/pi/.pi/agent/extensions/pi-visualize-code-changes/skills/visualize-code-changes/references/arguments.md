# Invocation arguments

Read this only when the skill invocation includes scope text or flags. In Pi,
parse the trailing invocation text as one shell-like string: flags may appear in
any order, and double quotes preserve spaces.

```text
[scope] [--lens TYPE] [--second-lens TYPE] [--focus PATH]... [--out PATH] [--slug NAME] [--render]
```

| Token | Effect |
|---|---|
| `scope` | Pins the change set using a form below. |
| `--lens TYPE` | Uses `control-flow`, `dependency`, `sequence`, `state`, `data-flow`, or `structure`; accept `flow`, `deps`, and `seq` aliases. |
| `--second-lens TYPE` | Adds one complementary change view using the same lens names and aliases. Requires `--lens`. |
| `--focus PATH` | Limits deep reading and diagrams to this path; repeatable. Still inspect one hop of callers/callees. |
| `--out PATH` | Writes Markdown at this exact path. |
| `--slug NAME` | Sets the filename under `docs/diagrams/` when `--out` is absent. |
| `--render` | Also renders SVGs with the validator's `--render-to` option. |

Unknown path-like tokens become additional focus paths. Treat other free text as
scope. Explicit arguments pin decisions: do not ask again for scope or lenses.

Only one primary and one second lens are allowed. Reject repeated lens flags,
`--second-lens` without `--lens`, identical normalized lens values, and unknown
lens names. A lone `--lens` explicitly requests a primary-only artifact. A valid
explicit second lens overrides automatic complementarity scoring, but stop if
the inspected source cannot support that perspective rather than inventing it.

## Scope forms

| Form | Resolve with |
|---|---|
| `uncommitted` / `working` | unstaged plus staged diffs |
| `staged` | staged diff only |
| `pr <n>` / `PR #<n>` / `#<n>` | `gh pr diff <n>` |
| `branch <name>` | default branch `...<name>` |
| `<base>...<head>` | exact three-dot range |
| `<base>..<head>` | exact two-dot range |
| `<sha>` / `HEAD` / `HEAD~N` | commit against its parent |
| `<sha>..<sha>` | exact commit range |

For `--focus`, still collect the full scope's diff stat and mention omitted files
in Notes. If an explicit PR, ref, or range fails, stop; never silently switch to
another scope.

Resolve the default branch from `refs/remotes/origin/HEAD`; if unavailable, use
an existing local `main`, then `master`. If none exists, stop and ask for an
explicit base.

## Default slug

When `--out` and `--slug` are both absent, derive the slug deterministically:

1. PR: `pr-<number>`
2. named branch: its final path component
3. commit: its short SHA
4. working tree: the sole focused path's basename without extension; for several
   focused paths sharing one top-level changed directory, that directory's name;
   otherwise `uncommitted`
5. session-only edits: the same path rule, otherwise `session-changes`

Lowercase it, replace each run of non-alphanumeric characters with `-`, and trim
leading or trailing hyphens. Write to `docs/diagrams/<slug>.md`. If that file
already exists, ask whether to replace it or choose another path. Without an
interactive question mechanism, stop and request `--out` or `--slug`; never
overwrite or create suffixed copies silently.
