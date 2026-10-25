---
name: readable-log
description: Turn a decision-log TSV (ts, phase, decision, why, evidence, result) into a readable Markdown file, one section per entry. Manual invocation only.
disable-model-invocation: true
---

# Readable log

Renders a decision log, such as the `decisions.tsv` a show-me-your-work run keeps, as Markdown. Each entry gets a numbered heading with its time and phase, the decision as a paragraph, then **Why.**, **Evidence.** and **Result.** lines. `scripts/render.py` does the rendering, so the layout is the same every time. Your part is choosing the file and the labels.

## Steps

1. **Find the log.** Use the TSV the user names. Without one, look for `decisions.tsv` under the working directory's `.local/`: use it if there is exactly one, otherwise ask which. Done when you have one path and its header row starts with the columns `ts`, `phase` and `decision`.

2. **Choose the labels.** Each is optional; leave out any you can't fill from the log, the files beside it, or the conversation.
   - `--title`: what the run was, such as "Decision log: simplification run and follow-ups". Without it the title is the log's folder name, and the date when every entry shares one.
   - `--phase NAME=LABEL`, once per phase whose name hides what it stands for. For example, phases named in the plan's order (`pr1`, `pr2`) get the GitHub PR they became (`pr1=#21 bug fixes`); `pr*-body.md` files and `gh pr list` show the mapping. Leave out phases whose names already say what they are.
   - `--note`: one sentence a reader needs before reading, such as which phase holds corrections to earlier entries.

3. **Render.**

   ```sh
   python3 ~/.claude/skills/readable-log/scripts/render.py <log.tsv> [--title ...] [--note ...] [--phase NAME=LABEL ...]
   ```

   It writes `<log>.md` next to the TSV (`--out` sets another path) and prints the path and the entry count. Done when that count equals the TSV's data rows: `grep -vc $'^ts\t' <log.tsv>`.

4. **Report** the Markdown path and the entry count. Say the file is a snapshot of the log: entries added later need another run. For reading, suggest `:set wrap linebreak` in Neovim, or `glow -p <file>`.
