import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { chmodSync, copyFileSync, existsSync, lstatSync, mkdirSync, mkdtempSync,
  readFileSync, readdirSync, readlinkSync, rmSync, symlinkSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import test from "node:test";

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
    files.push("scripts/dotfiles", "scripts/pi-setup", "packages/common.txt");
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
      env: { ...process.env, HOME: target, PI_CODING_AGENT_DIR: "" }, cwd: scratch, encoding: "utf8", stdio: "pipe", timeout: 30_000,
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
