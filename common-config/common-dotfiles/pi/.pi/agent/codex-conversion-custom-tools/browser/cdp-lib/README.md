# Browser CDP internals

Based on the modular browser example shipped by `@howaboua/pi-codex-conversion` 3.0.23. This is now a local fork: `snapshot.mjs` separates full capture from bounded rendering and suppresses protected field values; `cli.mjs`/`daemon.mjs` route semantic operations to `../semantic-page.mjs` inside the existing serialized tab bridge. The daemon also reuses `waitForDocumentReady` for newly opened pages.

Synchronize upstream fixes as a unit, preserving these integration points and running all browser tests. `cdp.mjs` remains the stable entry point; `launcher.mjs` owns environment-specific browser startup policy. TypeSafe transport/ranking lives outside this directory in `../typesafe.mjs`.
