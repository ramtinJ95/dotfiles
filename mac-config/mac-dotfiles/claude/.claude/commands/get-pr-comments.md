---
description: Get the PR comments by copilot in github to evaluate them
argument-hint: <pr-url>
---

Use gh cli tool to fetch the PR comments from copilot on github and think critically about each comment if it actually provides value, then give me your assessment for one final review before we decide if we should fix or implement what it's saying. Also make sure you use the knowledge about the libraries and frameworks in use in the project while doing your critical thinking. Don't hesitate to use the ctx7 CLI (e.g. `npx ctx7@latest library <name> "<query>"`) for fetching more library and framework specific documentation if you need it. This is the link to the PR: $1
