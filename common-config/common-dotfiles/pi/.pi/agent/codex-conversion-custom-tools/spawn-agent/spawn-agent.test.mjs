import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { resolve } from "node:path";
import test from "node:test";

import { resolveTargetAlias } from "../herdr-agent/herdr-agent.mjs";
import {
	buildAgentName,
	buildInteractivePiArgs,
	buildPiArgs,
	buildSpawnLabel,
	detectReviewContext,
	parseSpawnAgentRequest,
	resolveHerdrContext,
	runHerdrSpawn,
	startHerdrAgent,
	waitForHerdrAgentReady,
} from "./spawn-agent.mjs";

test("accepts and normalizes a task label", () => {
	const request = parseSpawnAgentRequest(
		JSON.stringify({
			agent_type: "explorer",
			message: "Inspect it",
			label: "  Trace   authentication\nflow  ",
		}),
	);
	assert.equal(request.label, "Trace authentication flow");
	assert.equal(request.interactive, true);
	assert.equal(buildSpawnLabel(request, "/tmp/project"), "Explore · Trace authentication flow");
});

test("accepts an explicit headless request", () => {
	const request = parseSpawnAgentRequest(
		JSON.stringify({
			agent_type: "reviewer",
			message: "Review it",
			interactive: false,
		}),
	);
	assert.equal(request.interactive, false);
	assert.throws(
		() =>
			parseSpawnAgentRequest(
				JSON.stringify({
					agent_type: "reviewer",
					message: "Review it",
					interactive: "false",
				}),
			),
		/interactive must be a boolean/,
	);
});

test("accepts per-task thinking overrides while keeping the configured model", () => {
	const request = parseSpawnAgentRequest(
		JSON.stringify({
			agent_type: "explorer",
			message: "Inspect it",
			thinking: "xhigh",
		}),
	);
	assert.equal(request.thinking, "xhigh");
	for (const args of [
		buildPiArgs(request, request.message),
		buildInteractivePiArgs(request),
	]) {
		assert.deepEqual(
			args.slice(args.indexOf("--model"), args.indexOf("--model") + 4),
			[
				"--model",
				"openai-codex/gpt-6-astra",
				"--thinking",
				"xhigh",
			],
		);
	}
});

test("keeps role defaults when thinking is omitted", () => {
	for (const [agent_type, thinking] of [
		["explorer", "low"],
		["reviewer", "medium"],
		["worker", "high"],
	]) {
		const request = parseSpawnAgentRequest(JSON.stringify({
			agent_type,
			message: "Perform the task",
			...(agent_type === "worker" ? { user_requested: true } : {}),
		}));
		assert.equal(request.thinking, undefined);
		for (const args of [
			buildPiArgs(request, request.message),
			buildInteractivePiArgs(request),
		]) {
			assert.deepEqual(
				args.slice(args.indexOf("--model"), args.indexOf("--model") + 4),
				["--model", "openai-codex/gpt-6-astra", "--thinking", thinking],
			);
		}
	}
});

test("rejects model overrides and invalid thinking overrides", () => {
	assert.throws(
		() =>
			parseSpawnAgentRequest(
				JSON.stringify({
					agent_type: "explorer",
					message: "Inspect it",
					model: "  ",
				}),
			),
		/unknown field: model/,
	);
	assert.throws(
		() =>
			parseSpawnAgentRequest(
				JSON.stringify({
					agent_type: "explorer",
					message: "Inspect it",
					thinking: "extreme",
				}),
			),
		/thinking must be one of/,
	);
});

test("requires explicit user-request declaration for worker agents", () => {
	assert.throws(
		() =>
			parseSpawnAgentRequest(
				JSON.stringify({ agent_type: "worker", message: "Implement it" }),
			),
		/worker requires user_requested=true/,
	);
	const request = parseSpawnAgentRequest(
		JSON.stringify({
			agent_type: "worker",
			message: "Implement it",
			user_requested: true,
		}),
	);
	assert.equal(request.user_requested, true);
	assert.equal(buildSpawnLabel(request, "/tmp/project"), "Work · project");
	assert.throws(
		() =>
			parseSpawnAgentRequest(
				JSON.stringify({
					agent_type: "explorer",
					message: "Inspect it",
					user_requested: true,
				}),
			),
		/user_requested is only valid for the worker agent/,
	);
});

test("fixes worker to astra high and rejects model-controlled thinking", () => {
	assert.throws(
		() =>
			parseSpawnAgentRequest(
				JSON.stringify({
					agent_type: "worker",
					message: "Implement it",
					user_requested: true,
					thinking: "high",
				}),
			),
		/thinking is not configurable for worker/,
	);
	for (const args of [
		buildPiArgs({ agent_type: "worker", thinking: "max" }, "Implement it"),
		buildInteractivePiArgs({ agent_type: "worker", thinking: "max" }),
	]) {
		assert.deepEqual(
			args.slice(args.indexOf("--model"), args.indexOf("--model") + 4),
			[
				"--model",
				"openai-codex/gpt-6-astra",
				"--thinking",
				"high",
			],
		);
	}
});

test("builds a worker Pi with the general-purpose worker prompt", () => {
	const args = buildInteractivePiArgs({ agent_type: "worker" });
	assert.equal(args.includes("--no-approve"), true);
	assert.equal(args.includes("--approve"), false);
	const extensions = args
		.map((arg, index) => (args[index - 1] === "--extension" ? arg : undefined))
		.filter(Boolean);
	assert.equal(extensions.length, 1);
	assert.equal(extensions[0].endsWith("/worker-profile"), true);
	assert.equal(args.includes("--skill"), false);
	const profile = JSON.parse(
		readFileSync(resolve(extensions[0], "package.json"), "utf8"),
	);
	assert.equal(profile.pi.extensions.length, 8);
	assert.deepEqual(
		profile.pi.skills.map((path) => path.split("/").at(-2)),
		["grok", "grilling", "lavish"],
	);
	for (const resource of [...profile.pi.extensions, ...profile.pi.skills])
		assert.equal(existsSync(resolve(extensions[0], resource)), true, resource);
	assert.equal(args.join(" ").length < 1_000, true);
	assert.deepEqual(
		args.slice(
			args.indexOf("--exclude-tools"),
			args.indexOf("--exclude-tools") + 2,
		),
		["--exclude-tools", "spawn_agent"],
	);
	assert.deepEqual(args.slice(args.indexOf("--model"), args.indexOf("--model") + 4), [
		"--model",
		"openai-codex/gpt-6-astra",
		"--thinking",
		"high",
	]);
	assert.match(args.at(-3), /worker\.prompt\.md$/);
	assert.match(args.at(-1), /coordination\.prompt\.md$/);
});

test("keeps the headless worker lean", () => {
	const args = buildPiArgs({ agent_type: "worker" }, "Implement it");
	assert.equal(args.filter((arg) => arg === "--extension").length, 1);
	assert.equal(args.includes("--skill"), false);
	assert.deepEqual(
		args.slice(
			args.indexOf("--exclude-tools"),
			args.indexOf("--exclude-tools") + 2,
		),
		["--exclude-tools", "spawn_agent"],
	);
});

test("builds an interactive isolated Pi with Herdr reporting", () => {
	const args = buildInteractivePiArgs({ agent_type: "reviewer" });
	assert.equal(args.includes("--print"), false);
	assert.equal(args.includes("--no-session"), false);
	assert.equal(args.includes("--no-extensions"), true);
	assert.equal(args.includes("--no-approve"), true);
	assert.equal(args.filter((arg) => arg === "--extension").length, 2);
	assert.match(args.at(-1), /coordination\.prompt\.md$/);
});

test("uses a valid stable Herdr agent name separate from the display label", () => {
	assert.equal(
		buildAgentName({ agent_type: "explorer" }, "w1:p42"),
		"explorer-w1-p42",
	);
});

test("resolves the spawned child parent alias without exposing its pane id to the model", () => {
	assert.equal(
		resolveTargetAlias("parent", {
			SPAWN_AGENT_PARENT_PANE_ID: "pane-parent",
		}),
		"pane-parent",
	);
	assert.equal(resolveTargetAlias("pane-child", {}), "pane-child");
	assert.throws(() => resolveTargetAlias("parent", {}), /only to a spawned subagent/);
});

test("uses headless mode only when Herdr is disabled", () => {
	assert.equal(resolveHerdrContext({}), undefined);
	assert.throws(
		() => resolveHerdrContext({ HERDR_ENV: "1" }),
		/HERDR_SOCKET_PATH or HERDR_PANE_ID is missing/,
	);
	assert.deepEqual(
		resolveHerdrContext({
			HERDR_ENV: "1",
			HERDR_SOCKET_PATH: "/tmp/herdr.sock",
			HERDR_PANE_ID: "pane-parent",
		}),
		{ socketPath: "/tmp/herdr.sock", parentPaneId: "pane-parent" },
	);
});

test("waits for a newly-created tab shell before starting its agent", async () => {
	let attempts = 0;
	const client = {
		async request(method, params, timeoutMs) {
			assert.equal(method, "agent.start");
			assert.equal(params.timeout_ms, 30_000);
			assert.equal(timeoutMs, 35_000);
			attempts += 1;
			if (attempts === 1) throw new Error("agent target pane is not an available shell");
			return { started: true };
		},
	};
	const waits = [];
	const result = await startHerdrAgent(
		client,
		{ pane_id: "pane-child", timeout_ms: 30_000 },
		Date.now() + 1_000,
		async (milliseconds) => waits.push(milliseconds),
	);
	assert.deepEqual(result, { started: true });
	assert.equal(attempts, 2);
	assert.deepEqual(waits, [100]);
});

test("waits for Herdr launch detection before prompting the agent", async () => {
	let attempts = 0;
	const client = {
		async request(method) {
			assert.equal(method, "agent.get");
			attempts += 1;
			return {
				agent:
					attempts === 1
						? { launch_pending: true }
						: { interactive_ready: true, launch_pending: false },
			};
		},
	};
	const waits = [];
	const ready = await waitForHerdrAgentReady(
		client,
		"pane-child",
		Date.now() + 1_000,
		async (milliseconds) => waits.push(milliseconds),
	);
	assert.equal(ready.interactive_ready, true);
	assert.equal(attempts, 2);
	assert.deepEqual(waits, [100]);
});

function spawnHarness({ panel = {}, view = {}, promptError, readyError } = {}) {
	const calls = [];
	const readyPanel = {
		pane_id: "pane-child",
		terminal_id: "terminal-child",
		agent: "pi",
		agent_status: "idle",
		interactive_ready: true,
		launch_pending: false,
		agent_session: { kind: "path", value: "/tmp/child.jsonl" },
	};
	let prompted = false;
	const client = {
		async request(method, params, timeoutMs) {
			calls.push({ method, params, timeoutMs });
			if (method === "agent.get" && params.target === "pane-parent") {
				return { agent: { agent: "pi", workspace_id: "workspace-1" } };
			}
			if (method === "tab.create") {
				return {
					tab: { tab_id: "tab-child" },
					root_pane: { pane_id: "pane-child" },
				};
			}
			if (method === "agent.start") return {};
			if (method === "agent.prompt") {
				prompted = true;
				if (promptError) throw promptError;
				return { agent: { ...readyPanel, ...panel } };
			}
			if (method === "agent.get" && params.target === "pane-child") {
				assert.equal(prompted, false, "do not reread a pane that could have advanced");
				if (readyError) throw readyError;
				return { agent: readyPanel };
			}
			throw new Error(`unexpected ${method}`);
		},
	};
	const reader = {
		reads: 0,
		async read(path) {
			assert.equal(path, "/tmp/child.jsonl");
			this.reads += 1;
			if (this.reads === 1) {
				return { path, leaf_id: "initial" };
			}
			assert.equal(this.reads, 2, "do not reread after collecting the settled reply");
			return {
				path,
				assistant: { id: "reply-1", text: "Found it" },
				assistant_entry: { id: "reply-1", stop_reason: "stop" },
				...view,
			};
		},
	};
	return {
		calls,
		reader,
		run: () => runHerdrSpawn(
			{ agent_type: "explorer", label: "Trace auth" },
			{ cwd: "/repo", message: "Inspect auth" },
			{ socketPath: "/tmp/herdr.sock", parentPaneId: "pane-parent" },
			client,
			reader,
		),
	};
}

test("starts a background agent and returns the server-wait completion without repolling", async () => {
	const { run, calls, reader } = spawnHarness();
	const output = await run();
	assert.deepEqual(JSON.parse(output), {
		tab: "tab-child",
		pane: "pane-child",
		label: "Explore · Trace auth",
		status: "idle",
		text: "Found it",
	});
	assert.deepEqual(
		calls.map(({ method }) => method),
		[
			"agent.get",
			"tab.create",
			"agent.start",
			"agent.get",
			"agent.prompt",
		],
	);
	assert.equal(calls[1].params.focus, false);
	assert.equal(calls[1].params.workspace_id, "workspace-1");
	assert.equal(calls[2].params.pane_id, "pane-child");
	assert.equal(calls[2].params.name, "explorer-pane-child");
	assert.equal(calls[4].params.text, "Inspect auth");
	assert.deepEqual(calls[4].params.wait, {
		until: ["idle", "done", "blocked"], timeout_ms: 1_800_000,
	});
	assert.equal(calls[4].timeoutMs, 1_805_000);
	assert.equal(reader.reads, 2);
});

test("closes a newly-created tab when Pi fails to start", async () => {
	const calls = [];
	const client = {
		async request(method, params) {
			calls.push({ method, params });
			if (method === "agent.get") {
				return { agent: { agent: "pi", workspace_id: "workspace-1" } };
			}
			if (method === "tab.create") {
				return {
					tab: { tab_id: "tab-child" },
					root_pane: { pane_id: "pane-child" },
				};
			}
			if (method === "agent.start") throw new Error("Pi did not become ready");
			if (method === "tab.close") return {};
			throw new Error(`unexpected ${method}`);
		},
	};
	await assert.rejects(
		runHerdrSpawn(
			{ agent_type: "reviewer", label: "Review auth" },
			{ cwd: "/repo", message: "Review auth" },
			{ socketPath: "/tmp/herdr.sock", parentPaneId: "pane-parent" },
			client,
			{},
		),
		/Pi did not become ready/,
	);
	assert.equal(calls.at(-1).method, "tab.close");
});

test("readiness retries only agent-not-found during launch detection", async () => {
	let attempts = 0;
	const waits = [];
	const ready = await waitForHerdrAgentReady({
		async request() {
			if (++attempts === 1)
				throw Object.assign(new Error("not detected yet"), { code: "agent_not_found" });
			return { agent: { interactive_ready: true, launch_pending: false } };
		},
	}, "pane-child", Date.now() + 1_000, async (ms) => waits.push(ms));
	assert.equal(ready.interactive_ready, true);
	assert.deepEqual(waits, [100]);
});

test("readiness propagates permanent transport and protocol failures immediately", async () => {
	for (const error of [
		Object.assign(new Error("socket disconnected"), { code: "ECONNRESET" }),
		new Error("Herdr returned invalid JSON"),
		Object.assign(new Error("pane removed"), { code: "pane_not_found" }),
	]) {
		await assert.rejects(waitForHerdrAgentReady({
			request: async () => { throw error; },
		}, "pane-child", Date.now() + 1_000, async () => assert.fail("must not retry")),
			(actual) => actual === error);
	}
	await assert.rejects(waitForHerdrAgentReady({ request: async () => ({}) },
		"pane-child", Date.now() + 1_000, async () => assert.fail("must not retry")), TypeError);
});

test("readiness timeout identifies the pane", async () => {
	await assert.rejects(waitForHerdrAgentReady({}, "pane-child", Date.now() - 1),
		/pane-child did not become an interactive Pi agent before timeout/);
});

test("spawn preserves full replies instead of applying coordination's text limit", async () => {
	const text = "x".repeat(40_000);
	const output = JSON.parse(await spawnHarness({
		view: { assistant: { id: "reply-1", text } },
	}).run());
	assert.equal(output.text, text);
	assert.equal(output.truncated, undefined);
});

test("spawn preserves a blocked agent's question", async () => {
	const output = JSON.parse(await spawnHarness({
		panel: { agent_status: "blocked" },
		view: { ask: { handoff: false, prompts: [
			{ title: "Which scope?", multiple: false, choices: [{ label: "Current" }] },
		] } },
	}).run());
	assert.equal(output.status, "blocked");
	assert.equal(output.text, null);
	assert.deepEqual(output.ask.prompts[0].choices, ["Current"]);
});

test("spawn rejects a replaced terminal before reading its reply", async () => {
	const { run, reader } = spawnHarness({ panel: { terminal_id: "replacement" } });
	await assert.rejects(run(), /pane-child no longer hosts the targeted Pi agent/);
	assert.equal(reader.reads, 1);
});

test("spawn surfaces assistant failures and missing completion session paths", async () => {
	await assert.rejects(spawnHarness({ view: {
		assistant_entry: { id: "reply-1", stop_reason: "error" },
		assistant: { id: "reply-1", text: "Provider rejected request" },
	} }).run(), /Provider rejected request/);
	await assert.rejects(spawnHarness({ panel: { agent_session: undefined } }).run(),
		/completed without reporting a Pi session path; inspect Herdr pane pane-child/);
});

test("turn timeout keeps the started tab and includes the recovery pane", async () => {
	const error = Object.assign(new Error("server wait expired"), { code: "timeout" });
	const { run, calls } = spawnHarness({ promptError: error });
	await assert.rejects(run(), (actual) => {
		assert.match(actual.message, /did not settle within 1800000ms; inspect Herdr pane pane-child/);
		assert.equal(actual.cause, error);
		return true;
	});
	assert.equal(calls.some(({ method }) => method === "tab.close"), false);
});

test("readiness errors are not mislabeled as task timeouts", async () => {
	const error = Object.assign(new Error("readiness request timed out"), { code: "timeout" });
	const { run, calls } = spawnHarness({ readyError: error });
	await assert.rejects(run(), (actual) => actual === error);
	assert.equal(calls.some(({ method }) => method === "agent.prompt"), false);
});

function git(cwd, ...args) {
	return execFileSync("git", [
		"-c", "user.name=Spawn Test", "-c", "user.email=spawn-test@example.invalid",
		"-c", "commit.gpgsign=false", "-c", "core.hooksPath=/dev/null", ...args,
	], { cwd, encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] }).trim();
}

function reviewRepo(t, branch = "main") {
	const cwd = mkdtempSync(resolve(tmpdir(), "spawn-review-test-"));
	t.after(() => rmSync(cwd, { recursive: true, force: true }));
	git(cwd, "init", "--initial-branch", branch);
	return cwd;
}

test("review context handles an unborn branch and a repo without conventional bases", (t) => {
	const cwd = reviewRepo(t, "topic");
	assert.equal(detectReviewContext(cwd).scope, "current-state");
	git(cwd, "commit", "--allow-empty", "-m", "fixture");
	const review = detectReviewContext(cwd);
	assert.equal(review.scope, "current-state");
	assert.equal(review.baseBranch, undefined);
});

test("review context preserves branch preference and clean versus dirty scopes", (t) => {
	const cwd = reviewRepo(t);
	git(cwd, "commit", "--allow-empty", "-m", "fixture");
	assert.equal(detectReviewContext(cwd).scope, "latest-commit");
	git(cwd, "branch", "dev");
	git(cwd, "branch", "master");
	git(cwd, "checkout", "-b", "feature");
	assert.equal(detectReviewContext(cwd).baseBranch, "dev");
	writeFileSync(resolve(cwd, "untracked.txt"), "fixture");
	assert.equal(detectReviewContext(cwd).scope, "base-diff");
	git(cwd, "checkout", "dev");
	assert.equal(detectReviewContext(cwd).baseBranch, "main");
});

test("review context falls back to master when main and dev do not exist", (t) => {
	const cwd = reviewRepo(t, "master");
	git(cwd, "commit", "--allow-empty", "-m", "fixture");
	git(cwd, "checkout", "-b", "feature");
	assert.equal(detectReviewContext(cwd).baseBranch, "master");
});
