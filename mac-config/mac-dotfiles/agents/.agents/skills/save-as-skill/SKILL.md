---
name: save-as-skill
description: >
  Capture the current session's workflow and save it as a reusable
  project-scoped skill. Use after completing an investigation, debugging
  session, or any repeatable workflow you want to turn into a /command.
argument-hint: "[skill-name]"
disable-model-invocation: true
---

# Save Current Session as a Reusable Skill

You are running inline and have access to the full conversation history.
Your job is to distill what happened in this session into a reusable,
project-scoped skill.

## Step 1: Analyze the session

Review the full conversation and identify:

- **The goal**: What was the user trying to accomplish?
- **The workflow**: What sequence of steps were taken to get there?
- **Tools used**: Which tools and commands were executed?
- **Key decisions**: Where did the approach branch or require user input?
- **Hardcoded values**: Specific IDs, names, paths, dates that should become parameters
- **Dead ends**: Steps that were tried but abandoned (exclude these from the skill)
- **Environment assumptions**: Namespace, service names, file paths, CLI tools that must exist

Focus only on the **final working path** — skip retries, mistakes, and exploration
that didn't contribute to the outcome.

## Step 2: Confirm with the user

Present a brief summary of what you plan to capture and ask the user:

1. **Skill name** (use $ARGUMENTS[0] if provided, otherwise ask).
   Must be lowercase, hyphens only, max 64 chars.
2. **Description**: A one-line summary of when to use this skill.
3. **Parameters**: Which hardcoded values should become arguments?
   Suggest which values to parameterize and how (e.g., `$0` for a primary ID,
   `$1` for environment).
4. **Scope check**: Confirm saving to `.claude/skills/<name>/` in the current project.
5. **Manual-only?**: Should `disable-model-invocation` be true (recommended for
   workflows with side effects like kubectl, API calls, deployments)?

## Step 3: Generate the skill

Create `.claude/skills/<skill-name>/SKILL.md` with:

### Frontmatter
```yaml
---
name: <skill-name>
description: <one-line description>
argument-hint: "[<param1>] [<param2>]"
disable-model-invocation: true  # or false based on user preference
allowed-tools: <tools that were used in the session>
---
```

### Body structure

1. **Context header**: One line stating what the skill does and what `$ARGUMENTS` map to
2. **Environment constants**: Bake in project-specific values that are stable
   (namespaces, service names, config file paths) so the skill doesn't have to
   rediscover them each time
3. **Numbered phases/steps**: The distilled workflow in clear, actionable steps.
   Each step should include:
   - What to do and why
   - The exact command or tool call (with `$N` placeholders for parameterized values)
   - What to look for in the output
   - Decision points (if X then do Y, otherwise Z)
4. **Final output**: What the skill should produce at the end (report, summary,
   file changes, etc.)

### Guidelines for the generated skill

- Replace session-specific values with `$ARGUMENTS[N]` or `$N` placeholders
- Keep environment constants (namespaces, service names, stable paths) hardcoded
  since they rarely change and save rediscovery time
- Write steps as instructions to Claude, not as documentation for humans
- Include the exact commands that worked, not generic templates
- Add conditional branches only where the session actually hit decision points
- Do NOT include `context: fork` — the generated skill should run inline by default
  so it can interact with the user
- Do NOT add comments that just re-explain the step name
- Keep it concise — if a step is straightforward, one line is enough

## Step 4: Verify

After writing the skill file:

1. Read it back and confirm the structure looks correct
2. Check that all `$N` placeholders are documented in `argument-hint`
3. Confirm the skill directory exists at `.claude/skills/<skill-name>/SKILL.md`
4. Tell the user how to invoke it: `/<skill-name> <args>`
