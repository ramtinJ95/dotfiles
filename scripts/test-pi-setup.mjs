import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { chmodSync, copyFileSync, existsSync, lstatSync, mkdirSync, mkdtempSync,
  readFileSync, readdirSync, readlinkSync, rmSync, symlinkSync, writeFileSync } from "node:fs";
import { homedir, tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import test from "node:test";
import { checkPiTools, syncPiTools, verifyPiToolDiscovery } from "./pi-tools.mjs";

const repo = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const readJSON = path => JSON.parse(readFileSync(path, "utf8"));
const put = (path, text) => { mkdirSync(dirname(path), { recursive: true }); writeFileSync(path, text); };

test("Pi setup: clean clone, repeat sync, local state, old links, and conflicts", () => {
  const scratch = mkdtempSync(join(tmpdir(), "pi-setup-test-"));
  try {
    const fixture = join(scratch, "checkout");
    const common = join(fixture, "common-config/common-dotfiles");
    const source = join(common, "pi/.pi/agent");
    // Only versionable files, never the live npm cache/auth/session tree.
    const files = execFileSync("git", ["ls-files", "--cached", "--others", "--exclude-standard", "-z",
      "common-config/common-dotfiles/pi", "common-config/common-dotfiles/agents"], { cwd: repo, encoding: "utf8" }).split("\0").filter(Boolean);
    files.push("scripts/dotfiles", "scripts/pi-setup", "scripts/pi-tools.mjs", "packages/common.txt");
    for (const file of new Set(files)) {
      const from = join(repo, file), to = join(fixture, file);
      if (!existsSync(from)) continue; // deleted files still present in the index
      mkdirSync(dirname(to), { recursive: true });
      if (lstatSync(from).isSymbolicLink()) symlinkSync(readlinkSync(from), to);
      else copyFileSync(from, to);
    }
    chmodSync(join(fixture, "scripts/dotfiles"), 0o755);
    const home = join(scratch, "home");
    mkdirSync(home);
    const run = (target = home) => execFileSync(process.execPath, [join(fixture, "scripts/pi-setup"), "--config-only"], {
      env: { ...process.env, PATH: `${join(scratch, "bin")}:${process.env.PATH}`, HOME: target, PI_CODING_AGENT_DIR: "" },
      cwd: scratch, encoding: "utf8", stdio: "pipe", timeout: 30_000,
    });
    // Even a dirty source checkout cannot publish runtime state.
    put(join(source, "auth.json"), "source-private-fixture");
    put(join(source, "npm/node_modules/unwanted/index.js"), "cache");
    put(join(source, "sessions/unwanted.json"), "session");
    put(join(common, "agents/.agents/skills/.claude/unwanted"), "runtime");
    run();
    const agent = join(home, ".pi/agent");
    for (const path of [".pi", ".pi/agent", ".agents", ".agents/skills"]) {
      assert.equal(lstatSync(join(home, path)).isSymbolicLink(), false, path);
    }
    for (const name of ["settings.json", "pi-codex-conversion.json", "notes-compaction/settings.json"]) {
      assert.equal(lstatSync(join(agent, name)).isSymbolicLink(), false, name);
    }
    for (const name of ["auth.json", "npm", "sessions", "trust.json", "models-store.json", "local-llm"]) {
      assert.equal(existsSync(join(agent, name)), false, name);
    }
    assert.equal(existsSync(join(home, ".agents/skills/.claude")), false);
    assert.equal(existsSync(join(home, ".config/herdr")), false);
    assert.equal(existsSync(join(home, "workspace")), false);
    assert.equal(lstatSync(join(agent, "extensions/exa-deep-research.ts")).isSymbolicLink(), true);
    assert.equal(lstatSync(join(agent, "codex-conversion-custom-tools/browser.toml")).isFile(), true);
    assert.equal(lstatSync(join(agent, "codex-conversion-custom-tools/browser/browser.mjs")).isSymbolicLink(), true);
    assert.deepEqual(checkPiTools({ agent, source }), ["browser"]);
    assert.equal(lstatSync(join(agent, "shepherdr/profiles/reviewer/profile.json")).isSymbolicLink(), true);
    assert.equal(readJSON(join(agent, "settings.json")).packages.length, 11);
    assert.equal(readJSON(join(agent, "notes-compaction/settings.json")).normalCompaction, false);
    run();
    assert.equal(existsSync(join(home, ".pi/backups")), false, "unchanged sync needs no backup");

    put(join(agent, "auth.json"), "local-private-fixture");
    put(join(agent, "sessions/keep"), "session-fixture");
    const settings = readJSON(join(agent, "settings.json"));
    settings.theme = "local-theme";
    settings.packages = ["npm:obsolete"];
    settings.machineOnly = true;
    put(join(agent, "settings.json"), JSON.stringify(settings));
    const conversion = readJSON(join(agent, "pi-codex-conversion.json"));
    conversion.voice.inputDevice = "local-input";
    put(join(agent, "pi-codex-conversion.json"), JSON.stringify(conversion));
    run();
    assert.equal(readJSON(join(agent, "settings.json")).theme, "local-theme");
    assert.equal(readJSON(join(agent, "settings.json")).machineOnly, true);
    assert.equal(readJSON(join(agent, "settings.json")).packages.length, 11);
    assert.equal(readJSON(join(agent, "pi-codex-conversion.json")).voice.inputDevice, "local-input");
    assert.equal(readFileSync(join(agent, "auth.json"), "utf8"), "local-private-fixture");
    assert.equal(readFileSync(join(agent, "sessions/keep"), "utf8"), "session-fixture");
    assert.equal(readdirSync(join(home, ".pi/backups")).length, 1);

    // A generated Omarchy palette opts Linux setup into native synchronization.
    // Stub only the external command; exercise the real setup/Stow path.
    put(join(scratch, "bin/uname"), '#!/bin/sh\nprintf "Linux\\n"\n');
    put(join(scratch, "bin/omarchy"), `#!${process.execPath}
import assert from "node:assert/strict";
import { copyFileSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
assert.deepEqual(process.argv.slice(2), ["theme", "set", "pi", "--activate"]);
const agent = join(process.env.HOME, ".pi/agent");
const settings = JSON.parse(readFileSync(join(agent, "settings.json"), "utf8"));
settings.theme = "omarchy-system";
writeFileSync(join(agent, "settings.json"), JSON.stringify(settings, null, 2) + "\\n");
mkdirSync(join(agent, "themes"), { recursive: true });
copyFileSync(join(process.env.HOME, ".local/state/omarchy/current/theme/pi.json"),
  join(agent, "themes/omarchy-system.json"));
`);
    for (const cmd of ["uname", "omarchy"]) chmodSync(join(scratch, "bin", cmd), 0o755);
    const omarchy = join(scratch, "omarchy");
    const palette = join(omarchy, ".local/state/omarchy/current/theme/pi.json");
    put(palette, '{"name":"omarchy-system","vars":{"background":"#1f1f28"}}\n');
    run(omarchy);
    const omarchyAgent = join(omarchy, ".pi/agent");
    assert.equal(readJSON(join(omarchyAgent, "settings.json")).theme, "omarchy-system");
    assert.equal(readFileSync(join(omarchyAgent, "themes/omarchy-system.json"), "utf8"), readFileSync(palette, "utf8"));
    run(omarchy);
    assert.equal(existsSync(join(omarchy, ".pi/backups")), false, "Omarchy setup is idempotent");
    const themed = readJSON(join(omarchyAgent, "settings.json"));
    put(join(omarchyAgent, "settings.json"), JSON.stringify({ ...themed, theme: "dark" }));
    run(omarchy);
    assert.equal(readJSON(join(omarchyAgent, "settings.json")).theme, "omarchy-system");

    // Even with the same files, macOS must retain its own theme ownership.
    put(join(scratch, "bin/uname"), '#!/bin/sh\nprintf "Darwin\\n"\n');
    put(join(omarchyAgent, "settings.json"), JSON.stringify({ ...themed, theme: "macarchy-current" }));
    run(omarchy);
    assert.equal(readJSON(join(omarchyAgent, "settings.json")).theme, "macarchy-current");

    // A failed native sync is a setup error, not a successful dark fallback.
    put(join(scratch, "bin/uname"), '#!/bin/sh\nprintf "Linux\\n"\n');
    put(join(scratch, "bin/omarchy"), '#!/bin/sh\nexit 1\n');
    assert.throws(() => run(omarchy), /could not activate Omarchy/);

    const legacy = join(scratch, "legacy");
    mkdirSync(legacy);
    symlinkSync(join(common, "pi/.pi"), join(legacy, ".pi"));
    symlinkSync(join(common, "agents/.agents"), join(legacy, ".agents"));
    const original = readFileSync(join(source, "settings.json"), "utf8");
    run(legacy);
    assert.equal(lstatSync(join(legacy, ".pi/agent/settings.json")).isSymbolicLink(), false);
    assert.equal(readFileSync(join(source, "settings.json"), "utf8"), original);
    assert.equal(readFileSync(join(legacy, ".pi/agent/auth.json"), "utf8"), "source-private-fixture");

    const blocked = join(scratch, "blocked");
    put(join(blocked, ".pi/agent/extensions/exa-deep-research.ts"), "foreign");
    assert.throws(() => run(blocked));
    assert.equal(readFileSync(join(blocked, ".pi/agent/extensions/exa-deep-research.ts"), "utf8"), "foreign");
    assert.equal(existsSync(join(blocked, ".pi/agent/settings.json")), false);

    const foreign = join(scratch, "foreign");
    mkdirSync(foreign);
    symlinkSync(join(home, ".pi"), join(foreign, ".pi"));
    assert.throws(() => run(foreign), /Foreign directory link/);
    console.log("Verified clean/legacy setup, idempotence, pinned package list, runtime isolation, and conflict refusal.");
  } finally { rmSync(scratch, { recursive: true, force: true }); }
});

test("tool migration: discoverable files, backups, retired adapters and ownership", () => {
  const scratch = mkdtempSync(join(tmpdir(), "pi-tools-test-"));
  try {
    const source = join(scratch, "checkout/.pi/agent");
    const agent = join(scratch, "home/.pi/agent");
    const tools = "codex-conversion-custom-tools";
    const definition = 'usage = "await tools.browser(args)"\ncommand = "./browser/browser.mjs"\n';
    put(join(source, tools, "browser.toml"), definition);
    mkdirSync(join(agent, tools), { recursive: true });
    symlinkSync(join(source, tools, "browser.toml"), join(agent, tools, "browser.toml"));
    // A real path existing behind a symlink is not enough for adapter discovery.
    assert.throws(() => checkPiTools({ agent, source }), /Undiscoverable/);
    for (const name of [`${tools}/spawn_agent.toml`, `${tools}/herdr_agent.toml`,
      `${tools}/spawn-agent/spawn-agent.mjs`, `${tools}/herdr-agent/herdr-agent.mjs`,
      "extensions/herdr-agent-state.ts"]) {
      mkdirSync(dirname(join(agent, name)), { recursive: true });
      symlinkSync(join(source, name), join(agent, name)); // source was removed by git pull
    }
    put(join(agent, "sessions/keep"), "runtime");
    syncPiTools({ agent, source });
    assert.deepEqual(checkPiTools({ agent, source }), ["browser"]);
    assert.equal(readFileSync(join(agent, tools, "browser.toml"), "utf8"), definition);
    assert.equal(lstatSync(join(agent, tools, "browser.toml")).isFile(), true);
    assert.equal(readFileSync(join(agent, "sessions/keep"), "utf8"), "runtime");
    const backups = join(dirname(agent), "backups");
    const saved = readdirSync(backups);
    assert.equal(saved.length, 1);
    assert.equal(readFileSync(join(backups, saved[0], "browser.toml"), "utf8"), definition);
    syncPiTools({ agent, source });
    assert.deepEqual(readdirSync(backups), saved, "unchanged sync is idempotent");

    // A conflicting retired file must stop the whole plan, before browser sync.
    put(join(agent, tools, "herdr_agent.toml"), "personal tool");
    put(join(source, tools, "browser.toml"), definition + "defer_loading = true\n");
    assert.throws(() => syncPiTools({ agent, source }), /not a checkout-owned link/);
    assert.equal(readFileSync(join(agent, tools, "browser.toml"), "utf8"), definition);
    assert.equal(readFileSync(join(agent, tools, "herdr_agent.toml"), "utf8"), "personal tool");
    rmSync(join(agent, tools, "herdr_agent.toml"));

    // A foreign browser definition is never adopted or rewritten.
    rmSync(join(agent, tools, "browser.toml"));
    put(join(scratch, "foreign.toml"), "foreign");
    symlinkSync(join(scratch, "foreign.toml"), join(agent, tools, "browser.toml"));
    assert.throws(() => syncPiTools({ agent, source }), /Foreign tool link/);
    assert.equal(readFileSync(join(scratch, "foreign.toml"), "utf8"), "foreign");
  } finally { rmSync(scratch, { recursive: true, force: true }); }
});

test("installed adapter: valid discovery, disabled definition and missing script", {
  skip: !process.env.PI_TEST_SDK,
}, async () => {
  const scratch = mkdtempSync(join(tmpdir(), "pi-adapter-test-"));
  try {
    const agent = join(scratch, "home/.pi/agent"), source = join(scratch, "source");
    const tools = "codex-conversion-custom-tools";
    const definition = 'usage = "await tools.browser(args)"\ncommand = "./browser/browser.mjs"\n';
    put(join(source, tools, "browser.toml"), definition);
    syncPiTools({ agent, source });
    put(join(agent, tools, "browser/browser.mjs"), "// fixture: never executed\n");
    symlinkSync(join(homedir(), ".pi/agent/npm"), join(agent, "npm"));
    const options = { agent, source, sdk: resolve(process.env.PI_TEST_SDK) };
    const result = await verifyPiToolDiscovery(options);
    assert.deepEqual(result.tools.map(tool => tool.name), ["browser"]);
    put(join(agent, tools, "browser.toml"), 'usage = "test"\ncommand = 42\n');
    await assert.rejects(verifyPiToolDiscovery(options), /command must be a non-empty string/);
    put(join(agent, tools, "browser.toml"), definition);
    rmSync(join(agent, tools, "browser/browser.mjs"));
    await assert.rejects(verifyPiToolDiscovery(options), /ENOENT|Missing tool script/);
  } finally { rmSync(scratch, { recursive: true, force: true }); }
});
