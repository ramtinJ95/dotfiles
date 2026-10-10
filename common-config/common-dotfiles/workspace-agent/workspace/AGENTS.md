# Workspace rules

## Style

* For technical work, use concise technical prose.
* Keep implementation plans local and out of the repository unless explicitly asked to check one in. PRs explain decisions and outcomes, not internal implementation plans.
* After a relevant PR merges, mention `/skill:pr-diary` once in the normal completion message. Do not open a modal or invoke it automatically.

## Codebase understanding

* Before changing unfamiliar or non-trivial code, trace how the relevant behavior fits into the existing system.
* Before substantive changes, present the smallest explanation that makes the decision understandable, naming the relevant symbols and file paths. Keep traces scoped to the task; a call path, call stack, and diagram are alternatives, not a mandatory bundle.
* Distinguish verified code paths from inferred or runtime-dependent behavior, and state what evidence would resolve uncertainty.
* After changing control flow or component interactions, summarize how the new path differs from the previous one.

## Code quality

* Read files in full before broad changes, audits, or editing unfamiliar files.
* Avoid speculative compatibility layers. Preserve published contracts and rolling-deploy safety unless a breaking change is explicitly approved; repository-specific migration constraints still apply.
* Inline single-use single-line helpers.
* Establish supported dependency and host versions before fixing API/type mismatches. Request approval for material version changes and respect repository-specific dependency rules; do not suppress errors to fit an unsupported API.
* Prefer descriptive names over comments.
* Add comments only for non-obvious constraints or rationale.

## Validation and delivery

* Match validation to the changed behavior and established workflow. Reuse existing harnesses and add focused regression coverage; do not add a CI workflow, service, documentation hierarchy, or separate testing framework unless necessary for the requested outcome or explicitly agreed. Keep unrelated branch content out of the deliverable.
* When asked to babysit a PR, follow checks and review feedback until only the stated human gate remains, or report a concrete blocker. Do not infer permission to merge.
* When asked to verify deployment, follow the release chain through the deployed version and affected behavior. Merged code or a green intermediate job is not completion.
