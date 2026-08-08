# tuido fmt — shorthand expansion + save-time autocmd

## Context

Typing Obsidian Tasks emoji fields (`📅 ⏫ ➕`) in vim is high-friction. The fix agreed in
conversation: a plain-ASCII **input dialect** that `tuido fmt` canonicalises into the emoji
**storage format**, wired into Neovim as a save-time autocmd. Shorthand never persists;
relative dates ("monday") are resolved at expansion time; the stored format stays pure
Obsidian Tasks syntax so round-trip fidelity and Obsidian compatibility are untouched.

Two deliverables:
1. `tuido fmt` in the tuido repo (`/Users/ramtin/personal/tuido`)
2. A `BufWritePre` autocmd in the dotfiles repo
   (`~/dotfiles/mac-config/mac-dotfiles/nvim/.config/nvim/lua/config/autocmds.lua`),
   next to the existing `md_line_length` group that already exempts `~/personal/todo`.

## Shorthand grammar

A token is `:key` at a word boundary (start of description or preceded by whitespace),
in the task line's description only. Keys are case-insensitive.

| token | expands to |
|---|---|
| `:p1` … `:p5` | 🔺 ⏫ 🔼 🔽 ⏬ (highest→lowest) |
| `:prio <v>` | priority; `<v>` is a `task.ParsePriority` name or digit 1–5 |
| `:due <when>` | 📅 |
| `:start <when>` | 🛫 |
| `:sched <when>` | ⏳ |

`<when>` is one token, whatever `parseWhen` accepts today (`YYYY-MM-DD | today |
tomorrow | week | <weekday>`). Weekday = next strictly-future occurrence (existing rule).

**Semantics (all consistent with the existing `parseFields` philosophy — malformed input
stays visible, never silently reinterpreted):**

- A consumed token is removed from the description; the field is set via setters.
- A token that cannot apply **stays literal** and prints a `⚠ path:line: …` warning:
  field already set (from emoji or an earlier token), unparseable value, missing value,
  unknown key. A value token starting with `:` counts as missing.
- Text like `12:30`, `foo:due`, `see :help` is never touched (`:help` is an unknown key;
  the others fail the word-boundary / known-key test).
- **Created stamp**: iff ≥1 token applied AND `Created == nil`, stamp ➕ today.
  Never stamp bare task lines — that would backdate pre-existing tasks.
- Tasks failing `Rewritable()` are warned and skipped *before* any mutation.
- Fenced code blocks, headings, prose: untouched (they aren't `LineTask`).
- Safety net: warn when a `LineTaskCont` (continuation line) contains an emoji field
  marker or a known shorthand token — almost always a botched hard wrap.
- **Fixpoint**: running `fmt` twice is a byte-level no-op (consumed tokens are gone;
  literal leftovers stay literal). Matches the fuzzer's canonical-stability invariant
  (`fuzz_test.go:51-53`) and the repo's idempotence habit.

## CLI shape

```
tuido fmt [list query]   # like sort: empty = whole current workspace, --all = everything
tuido fmt -              # stdin → stdout filter; no store, no init required, no commit
```

- List mode mirrors `cmdSort` (`sortopen.go:17-78`): `openApp` → `FindLists` → per list
  `Read` → expand → skip if `!f.Dirty()` → `st.Write(f)` → `✓ fmt ws/list (N expanded)`
  → `a.commit(path, "fmt: ws/list")`. Nothing changed → `· nothing to expand`.
- Stdin mode: `task.Parse("stdin", bytes)` → expand → write `f.Bytes()` to stdout.
  Warnings go to **stderr** (stdout is the document). `ErrConflicted` → exit 3
  (existing `exitConflict` mapping) — the autocmd then leaves the buffer alone.

## Implementation steps (tuido repo)

Small conventional commits, one per step.

### 1. `internal/task/task.go` — fill the setter gap
Add `SetDesc(string)`, `SetStart(*Date)`, `SetScheduled(*Date)` following the existing
compare-then-`dirty=true` shape (`setDate` helper at task.go:307). Without these, field
assignment doesn't flip `dirty` and `Text()` silently returns the old raw line.
`SetDesc` also refreshes `Tags` via `extractTags` (parse.go:342) — check visibility;
it's same-package so fine.

### 2. `cmd/tuido/dates.go` — clock seam
Refactor `parseWhen(s)` → `parseWhenAt(s string, now time.Time) (task.Date, error)`;
`parseWhen` becomes a one-line wrapper passing `time.Now()`. Pure mechanical; existing
callers unchanged. This is what makes fmt unit-testable with a fixed date.

### 3. `cmd/tuido/fmt.go` — the expander + command
- `expandTask(t *task.Task, now time.Time) (applied int, warnings []string)`:
  whitespace-tokenise `t.Desc`, walk left→right, apply per the grammar above, rebuild
  desc from unconsumed tokens joined by single spaces, call setters, stamp created.
- `expandFile(f *task.File, now time.Time) (applied int, warnings []string)`: loop
  tasks (checking `Rewritable()` first), plus the continuation-line warning scan
  (reuse `scanSegments`-equivalent via a small exported helper or just check for the
  marker runes; simplest: `task.HasFieldMarker(s string) bool` — tiny addition to
  internal/task if needed, else scan for shorthand keys only in cmd).
- `cmdFmt(args []string) error`: `-` → stdin mode; else list mode per CLI shape above.

### 4. Command registration (all required by existing meta-tests)
- `main.go` switch (~:46): `case "fmt": err = cmdFmt(rest)`; add line to `usage()` (~:208).
- `help.go` `helps` map: entry with summary, synopsis, notes, **≥1 example**
  (`TestHelpMatchesTheRealFlags` fails without one).
- `flags.go`: `registerFmt` (common flags + `--all`, i.e. reuse `registerScope`), plus a
  case in `registerFlags` (:139).

### 5. `completions/_tuido`
Add `'fmt:expand shorthand into emoji fields'` to the commands array (:19-31) and an
`_arguments` case with `_tuido_lists` like sort's (:38-79). Hand-maintained; no test
catches forgetting this, so it's an explicit step.

### 6. Docs
- `README.md` Commands table (~:160): `| tuido fmt [list] | expand :p2 / :due monday shorthand into emoji fields |`.
- New `### Shorthand` subsection under `## Dialect`, with the grammar table, the
  created-stamp rule, and the never-persists principle; cross-link from the existing
  "Don't hard-wrap task lines" subsection (mention the continuation-line warning).
  Include the BufWritePre snippet for Neovim users.

### 7. Tests
- `cmd/tuido/fmt_test.go` (package main, in-process, fixed `now`): expansion basics for
  every key; weekday resolution; created stamped vs preserved; duplicate field stays
  literal + warns; bad/missing value; unknown key untouched; `12:30`/`foo:due` untouched;
  fences and continuations untouched; continuation-line warning; **idempotence**
  (expand → serialise → parse → expand again == byte-identical); tasks failing
  `Rewritable` skipped.
- `main_test.go` subprocess tests (existing `env` harness): list-mode end-to-end
  (write file with shorthand → `fmt` → re-read, assert emoji + `➕ ` prefix, exact date
  avoided per existing convention); stdin mode (pipe in, compare stdout); conflicted
  stdin → exit 3; `fmt` twice → second run `· nothing to expand`. The two help
  meta-tests pick the command up automatically via `commandNames()`.

## Implementation step (dotfiles repo)

### 8. `lua/config/autocmds.lua` — save-time autocmd
New `tuido_fmt` augroup beside `md_line_length`, reusing the existing `todo_root`:

```lua
vim.api.nvim_create_autocmd("BufWritePre", {
  group = tuido_fmt,
  pattern = "*.md",
  callback = function(ev)
    local path = vim.fn.fnamemodify(vim.api.nvim_buf_get_name(ev.buf), ":p")
    if not vim.startswith(path, todo_root .. "/") then return end
    if vim.fn.executable("tuido") == 0 then return end
    local lines = vim.api.nvim_buf_get_lines(ev.buf, 0, -1, false)
    local res = vim.system({ "tuido", "fmt", "-" },
      { stdin = table.concat(lines, "\n") .. "\n" }):wait()
    if res.code ~= 0 then
      vim.notify("tuido fmt: " .. vim.trim(res.stderr or ""), vim.log.levels.WARN)
      return
    end
    local out = vim.split(res.stdout, "\n")
    if out[#out] == "" then table.remove(out) end
    if not vim.deep_equal(out, lines) then
      vim.api.nvim_buf_set_lines(ev.buf, 0, -1, false, out)
    end
  end,
})
```

BufWritePre (not Post): the buffer is filtered in place before the write, so no file
reload, no flicker, and the expansion lands in the same undo step as the save. Nonzero
exit (e.g. conflict markers) leaves the buffer untouched and notifies. Warnings on
stderr surface via notify only on failure — literal leftovers are visible in the buffer
itself, which is the loud-by-design channel.

Dotfiles change stays uncommitted (same as the earlier textwidth edit).

## Verification

1. `make test` in the tuido repo (unit + subprocess + fuzz corpus still green).
2. Manual CLI: `printf -- '- [ ] rotate token :p2 :due monday\n' | ./tuido fmt -` →
   `- [ ] rotate token ⏫ 📅 <next-monday> ➕ <today>`; pipe the output back through →
   byte-identical.
3. Headless nvim end-to-end: open a scratch file under `~/personal/todo`, insert a
   shorthand line, `:w`, assert the buffer now holds the emoji form (same technique as
   the earlier textwidth verification, with the built `tuido` on PATH).
4. `tuido fmt` twice on the real todo workspace: first run reports changes, second
   prints `· nothing to expand`, `git -C ~/personal/todo diff` empty after the second.
