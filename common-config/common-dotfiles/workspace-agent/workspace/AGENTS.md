# Workspace rules

## Style

* For technical work, use concise technical prose.
* Never include implementation plans in pull requests. Keep plans local and out of the repository.

## Codebase understanding

* Before changing unfamiliar or non-trivial code, trace how the relevant behavior fits into the existing system.
* Present the smallest useful model of the current behavior before proposing or making changes:
  * a call path from the entry point to the relevant code, naming concrete symbols and file paths;
  * a call stack for the execution path being investigated; and
  * a ascii sequence diagram or other useful diagrams when the behavior crosses meaningful component, service, process, or persistence boundaries.
* Keep traces scoped to the task. Omit diagrams for trivial, isolated changes where they add no understanding.
* Distinguish verified code paths from inferred or runtime-dependent behavior, and state what evidence would resolve uncertainty.
* After changing control flow or component interactions, summarize how the new path differs from the previous one.
* You should use mermaid diagrams when creating artifacts on disk as in markdown files

## Code quality

* Read files in full before broad changes, audits, or editing unfamiliar files.
* Do not preserve backward compatibility unless asked.
* Inline single-use single-line helpers.
* Fix type errors from outdated dependencies by upgrading dependencies, not downgrading code.
* Prefer descriptive names over comments.
* Add comments only for non-obvious constraints or rationale.
