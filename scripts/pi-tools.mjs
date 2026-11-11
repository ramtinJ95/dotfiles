// Custom-tool TOMLs must be real files: pi-codex-conversion uses Dirent.isFile().
// Companion scripts stay Stow links. Never patch the installed npm package.
import assert from "node:assert/strict";
import { lstatSync, mkdirSync, readFileSync, readdirSync, statSync,
  readlinkSync, renameSync, rmdirSync, unlinkSync, writeFileSync } from "node:fs";
import { createRequire } from "node:module";
import { homedir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const toolDir = "codex-conversion-custom-tools";
const retired = [
  `${toolDir}/herdr_agent.toml`, `${toolDir}/spawn_agent.toml`,
  `${toolDir}/herdr-agent`, `${toolDir}/spawn-agent`,
  "extensions/herdr-agent-state.ts",
];
const stat = path => { try { return lstatSync(path); } catch (error) {
  if (error.code === "ENOENT") return undefined;
  throw error;
} };
const linkTarget = path => resolve(dirname(path), readlinkSync(path));
const definitions = source => readdirSync(join(source, toolDir)).filter(name => name.endsWith(".toml")).sort();

function realDirectories(agent) {
  for (const path of [dirname(agent), agent, join(agent, toolDir), join(agent, "extensions")]) {
    const current = stat(path);
    if (current && (!current.isDirectory() || current.isSymbolicLink())) {
      throw new Error(`Expected a real directory: ${path}; migrate its ownership first`);
    }
  }
}

// Plan the whole migration before changing anything. Only links to this checkout
// are ours to retire, including dangling links left after pulling deleted files.
function removalPlan(path, expected, plan) {
  const current = stat(path);
  if (!current) return;
  if (current.isSymbolicLink() && linkTarget(path) === expected) {
    plan.push([path, false]);
  } else if (current.isDirectory()) {
    for (const name of readdirSync(path)) removalPlan(join(path, name), join(expected, name), plan);
    plan.push([path, true]);
  } else throw new Error(`Retired Herdr asset is not a checkout-owned link: ${path}; review it manually`);
}

export function syncPiTools({ agent, source }) {
  realDirectories(agent);
  const removals = [];
  for (const name of retired) removalPlan(join(agent, name), join(source, name), removals);
  const writes = definitions(source).map(name => {
    const target = join(agent, toolDir, name), from = join(source, toolDir, name);
    const current = stat(target);
    if (current?.isSymbolicLink() && linkTarget(target) !== from) throw new Error(`Foreign tool link: ${target}`);
    if (current && !current.isSymbolicLink() && !current.isFile()) throw new Error(`Expected tool file: ${target}`);
    const text = readFileSync(from, "utf8");
    const previous = current ? readFileSync(target, "utf8") : undefined;
    return { target, name, text, previous, changed: !current || current.isSymbolicLink() || previous !== text };
  });
  let backup;
  for (const item of writes.filter(item => item.changed)) {
    if (item.previous !== undefined) {
      backup ??= join(dirname(agent), "backups", `tools-${Date.now()}-${process.pid}`);
      mkdirSync(backup, { recursive: true, mode: 0o700 });
      writeFileSync(join(backup, item.name), item.previous, { mode: 0o600, flag: "wx" });
    }
    mkdirSync(dirname(item.target), { recursive: true, mode: 0o700 });
    const temporary = `${item.target}.setup-${process.pid}`;
    writeFileSync(temporary, item.text, { mode: 0o600, flag: "wx" });
    renameSync(temporary, item.target);
    console.log(`Synced discoverable tool: ${item.target}`);
  }
  for (const [path, directory] of removals) {
    if (directory) rmdirSync(path); else unlinkSync(path);
    console.log(`Retired legacy Herdr asset: ${path}`);
  }
  if (backup) console.log(`Previous tool definitions: ${backup}`);
}

export function checkPiTools({ agent, source }) {
  realDirectories(agent);
  const entries = readdirSync(join(agent, toolDir), { withFileTypes: true });
  for (const entry of entries.filter(entry => entry.name.endsWith(".toml"))) {
    assert(entry.isFile(), `Undiscoverable tool definition (must be a regular file): ${entry.name}`);
  }
  const names = definitions(source);
  for (const name of names) assert(entries.some(e => e.name === name && e.isFile()), `Missing tool: ${name}`);
  for (const name of retired) assert(!stat(join(agent, name)), `Legacy Herdr asset still installed: ${name}`);
  return names.map(name => name.slice(0, -5));
}

// Use the installed adapter's parser/discovery, with the same SDK alias mechanism
// as Pi's extension loader. Structural checks alone miss invalid or disabled tools.
export async function verifyPiToolDiscovery({ agent, source, sdk }) {
  const expected = checkPiTools({ agent, source });
  const require = createRequire(sdk);
  const { createJiti } = await import(pathToFileURL(require.resolve("jiti")));
  const jiti = createJiti(import.meta.url, { alias: { "@earendil-works/pi-coding-agent": sdk } });
  const { discoverCustomToolsFromDirectories } = await jiti.import(join(agent,
    "npm/node_modules/@howaboua/pi-codex-conversion/dist/tools/code-mode/custom-tools.js"));
  const result = discoverCustomToolsFromDirectories([join(agent, toolDir)]);
  assert.equal(result.errors.length, 0, JSON.stringify(result.errors));
  for (const tool of result.tools) assert(!tool.disabledReason, `${tool.name}: ${tool.disabledReason}`);
  for (const name of expected) {
    const tool = result.tools.find(tool => tool.name === name);
    assert(tool, `Installed adapter did not discover ${name}`);
    // The parser turns a JS command into node + an absolute script argument.
    if (tool.command === process.execPath) {
      assert(statSync(tool.args[0]).isFile(), `Missing tool script: ${tool.args[0]}`);
    }
  }
  console.log(`Verified adapter discovery: ${expected.join(", ")}`);
  return result;
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const [action, flag, sdk] = process.argv.slice(2);
  if (!["--sync", "--check"].includes(action) || (flag && (flag !== "--sdk" || !sdk)) || process.argv.length > 5) {
    throw new Error("Usage: node scripts/pi-tools.mjs --sync|--check [--sdk /path/to/pi/dist/index.js]");
  }
  const repo = resolve(dirname(fileURLToPath(import.meta.url)), "..");
  const options = { agent: join(homedir(), ".pi/agent"), source: join(repo, "common-config/common-dotfiles/pi/.pi/agent") };
  if (process.env.PI_CODING_AGENT_DIR && resolve(process.env.PI_CODING_AGENT_DIR) !== options.agent) {
    throw new Error("Unset PI_CODING_AGENT_DIR: this script manages ~/.pi/agent only");
  }
  if (action === "--sync") syncPiTools(options);
  if (sdk) await verifyPiToolDiscovery({ ...options, sdk: resolve(sdk) });
  else console.log(`Verified tool files: ${checkPiTools(options).join(", ")}`);
}
