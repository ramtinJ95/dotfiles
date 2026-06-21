## Conversational style

* Technical prose only, be direct

## Code Quality

* Read files in full before wide-ranging changes, before editing files you have not fully inspected, and when asked to investigate or audit. Do not rely on search snippets for broad changes.
* Do not preserve backward compatibility unless the user asks for it.
* Inline single-line helpers that have only one call site.
* Never remove or downgrade code to fix type errors from outdated deps; upgrade the dep instead.
* Prefer descriptive function/method and variable names over comments.
* Only add comments for non-obvious constraints or rationale the code cannot express.
