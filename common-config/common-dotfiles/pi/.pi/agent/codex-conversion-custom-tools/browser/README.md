# Browser

Use for rendered evidence or interaction in an existing CDP-enabled browser. TypeSafe is the default semantic engine, not an optional reranker or a fallback model. Exact IDs, selectors, literal `pattern` searches, and CDP operations remain deterministic.

## Preferred calls

```js
await tools.browser(JSON.stringify({ tabs: [{ query: "unpaid customer bills" }] }))
await tools.browser(JSON.stringify({ open: [{ ref_id: "ABCDEF12", query: "cancellation fees" }] }))
await tools.browser(JSON.stringify({ find: [{ ref_id: "ABCDEF12", query: "where can I download the statement?" }] }))
await tools.browser(JSON.stringify({ type: [{ ref_id: "ABCDEF12", target: "invoice search field", text: "INV-1042" }] }))
await tools.browser(JSON.stringify({ click: [{ ref_id: "ABCDEF12", target: "download the statement" }] }))
await tools.browser(JSON.stringify({ verify: [{ ref_id: "ABCDEF12", claims: ["Invoice INV-1042 is paid", "A download link is present"] }] }))
```

`target` also works for `html` and `screenshot` on accessibility-tree interactive elements. Use a selector for arbitrary containers. Targets resolve and execute inside the existing per-tab daemon, without a Pi round-trip to select an ID. `open: [{url, query?}]` opens, waits for document readiness, and returns content in one tool call. SPA data may still be loading; `verify` checks observed state, not future readiness.

`tabs.query` now ranks semantically (formerly a substring filter). Use `tabs.pattern` for the old literal behavior. `find.query` is semantic; `find.pattern` is literal. Bare `tabs` and `open` still list/read without inference. No semantic enable flag is required.

Keep a result's `ref_id` and element IDs together. Each snapshot invalidates previous IDs for that tab. Same-tab commands remain serialized. Targeting rechecks the selected backend node and surrounding text after inference before acting. A stale/ambiguous/missing target or API failure produces an explicit error, never a silent keyword fallback or a guessed action.

Evidence is copied from source lines, not generated. `semantic` contains match probabilities, snapshot scope/coverage, omitted match counts, request/token counts, and latency. `response_length` selects 3/6/12 relevant sections; `omitted_matches` reports other relevant sections. `lineno` is a cursor within returned matches, while `content[].line` always identifies the original snapshot line. Fresh searches are evaluated against fresh page state, so cursors are not durable across changes.

## TypeSafe configuration and data flow

Set `TYPESAFE_API_KEY` in the environment of the host executing the browser operation. Optional `TYPESAFE_MODEL` defaults to `jev-latest`. The integration calls the documented `https://api.typesafe.ai/v1/systemone` endpoint directly using Node's fetch; there are no additional runtime dependencies. Tab daemons inherit the environment when started. SSH runs need the key installed on the remote host; keys are not forwarded in tool arguments.

Semantic operations send page text, element labels/context, queries, and claims to TypeSafe. They do not send screenshots, cookies, browser storage, HTML, form values, or typing payloads. URL metadata excludes credentials, queries, and fragments. Known environment secrets and common credential formats are redacted; this is not a guarantee that arbitrary secrets in visible page text can be detected. Exact CDP paths do not use TypeSafe.

Independent fit judgments are batched, with at most four requests in flight and all source candidates covered. Target selection uses Choice plus per-candidate Noul fits; large candidate sets are partitioned and their finalists compared in a shared Choice. Choice always includes `none`. Input budgets fail explicitly rather than silently omitting evidence. The current read thresholds (0.3/0.7) and target thresholds (fit 0.7, confidence 0.65) are initial operating settings, not measured calibration. Unsupported verification claims are not necessarily false.

Requests have a 15-second timeout and no automatic retry. No inference output is cached across page changes. An old daemon reporting `Unknown command: semantic` must be stopped for that tab with `stop: [{ref_id}]`, then retried. Stopping a bridge does not close its browser tab. Do not stop every shared bridge just to upgrade one. Remote installations need the updated companion directory as well.

## Tests

```sh
node --test browser.test.mjs cdp.test.mjs semantic.test.mjs
BROWSER_LIVE_TYPESAFE=1 node --test --test-name-pattern='LIVE TypeSafe' semantic.test.mjs
```

Normal tests use fake CDP/model responses and do not send data to TypeSafe. Live tests use synthetic fixtures only and print inference timings; they do not claim an end-to-end Pi speedup. Compare full task time and Pi round-trips separately from API inference latency.

Do not close a shared browser. Do not enable SSH routing, start a browser, alter CDP configuration, or configure remote paths unless the user asked for that setup. Ask before consequential external actions such as sending, posting, purchasing, uploading, deleting, or changing account settings.

The tool returns bounded page content, element references, and screenshot paths. Use raw CDP operations only when the bounded operations cannot express the needed inspection.
