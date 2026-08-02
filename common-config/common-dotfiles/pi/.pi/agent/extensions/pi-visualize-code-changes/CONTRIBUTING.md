# Contributing

Thanks for helping improve **pi-visualize-code-changes** — a Pi skill that turns
code changes into before / after / what-changed Mermaid diagrams.

By participating, you agree to uphold the [Code of Conduct](CODE_OF_CONDUCT.md).

## Ways to contribute

- Bug reports (validator false positives/negatives, broken skill steps, bad docs)
- Diagram quality improvements (lens recipes, syntax pitfalls, template)
- Docs and examples (`docs/diagrams/`, README)
- Skill workflow clarity (`skills/visualize-code-changes/SKILL.md`)

## Development setup

```bash
git clone https://github.com/BlockedPath/pi-visualize-code-changes.git
cd pi-visualize-code-changes

# load the local package into Pi
pi install "$PWD"
# or one-shot without installing
pi -e "$PWD"
```

Recommended companion (interactive lens prompts):

```bash
pi install npm:@juicesharp/rpiv-ask-user-question
```

Optional but useful for authoritative Mermaid checks and `--render` SVGs:

```bash
npm i -g @mermaid-js/mermaid-cli
# needs Chrome/Chromium, or Puppeteer's bundled browser
```

## Project layout

```text
skills/visualize-code-changes/
├── SKILL.md                 # agent workflow (main surface)
├── assets/template.md       # output document skeleton
├── references/              # lens recipes + syntax pitfalls
└── scripts/validate_mermaid.py
docs/diagrams/               # example outputs (dogfood)
```

There are no runtime npm dependencies. The only executable is the Python 3
validator (stdlib only).

## Making changes

1. Branch from `main`.
2. Keep skill instructions concrete and testable — prefer commands the agent can
   run over vague guidance.
3. If you touch Mermaid guidance or the validator, update
   `references/syntax-pitfalls.md` when the failure mode is general.
4. Validate any diagram Markdown you add or change:

   ```bash
   python3 skills/visualize-code-changes/scripts/validate_mermaid.py path/to/file.md
   # force heuristics (no mmdc):
   python3 skills/visualize-code-changes/scripts/validate_mermaid.py --lint-only path/to/file.md
   ```

   Run the validator regression tests when changing its rules:

   ```bash
   npm test
   ```

5. Dogfood the skill when the change affects the workflow:

   ```text
   /skill:visualize-code-changes uncommitted
   /skill:visualize-code-changes HEAD
   ```

## Pull requests

- Fill out the PR template.
- Keep PRs focused; separate refactors from behaviour changes when you can.
- Include before/after notes for skill or validator behaviour.
- Do not commit secrets, local Pi settings, or `node_modules`.
- New diagrams under `docs/diagrams/` should pass `validate_mermaid.py`.

### Commit style

Short imperative subjects are enough, e.g.:

```text
docs: clarify gh requirement for pr scope
fix(validator): treat bare end node as error
```

## Reporting bugs

Use the **Bug report** issue template. Include:

- Pi version (`pi --version` if available)
- Whether `mmdc` / Chrome are installed
- The diagram Markdown or a minimal repro
- Full `validate_mermaid.py` output when relevant

## Feature requests

Use the **Feature request** template. Explain the review problem the change
solves, not only the implementation idea.

## Security

Please do not open public issues for sensitive security reports. Contact the
repository owner privately (GitHub profile / security advisory if enabled).

## License

Contributions are licensed under the [MIT License](LICENSE).
