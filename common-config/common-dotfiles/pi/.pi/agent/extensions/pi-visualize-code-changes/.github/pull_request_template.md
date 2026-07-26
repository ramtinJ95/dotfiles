## Summary

<!-- What does this PR change, and why? -->

## Type of change

- [ ] Bug fix
- [ ] Skill / workflow improvement
- [ ] Validator change
- [ ] Docs / examples
- [ ] Packaging / CI / meta
- [ ] Other

## How to test

```bash
# local package
pi install "$PWD"
# or
pi -e "$PWD"

# validator (required if you touched diagrams or validate_mermaid.py)
python3 skills/visualize-code-changes/scripts/validate_mermaid.py path/to/file.md
python3 skills/visualize-code-changes/scripts/validate_mermaid.py --lint-only path/to/file.md
```

- [ ] I ran the relevant checks above
- [ ] New/changed Mermaid in `docs/diagrams/` (if any) validates cleanly
- [ ] Skill behaviour dogfooded when workflow text changed

## Notes for reviewers

<!-- Risks, follow-ups, screenshots of rendered Mermaid, etc. -->
