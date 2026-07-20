import assert from "node:assert/strict";
import createExtension, { _test } from "./index.ts";

const tests: Array<{ name: string; run: () => void | Promise<void> }> = [];

function test(name: string, run: () => void | Promise<void>): void {
	tests.push({ name, run });
}

const {
	evaluateCommandWithRm,
	executionIdentity,
	ApprovalStore,
	guardExecution,
	ensureCodeModeGuardInstalled,
	CODE_MODE_RUNTIME_KEY,
	CODE_MODE_GUARD_BRIDGE_KEY,
	CODE_MODE_TOOL_WRAPPED,
} = _test;

test("rm classification covers executable paths and common wrappers", () => {
	for (const command of [
		"rm -rf target",
		"/bin/rm -rf target",
		"sudo rm -rf target",
		"env FOO=bar rm -rf target",
		"command rm -rf target",
		"xargs rm",
		"find . -exec rm {} ;",
	]) {
		assert.equal(evaluateCommandWithRm(command).allow, false, command);
	}

	assert.equal(evaluateCommandWithRm('printf "%s\\n" "rm"').allow, true);
	assert.equal(evaluateCommandWithRm("kubectl port-forward service/api 8080:80 && rm marker").allow, false);
});

test("kubectl and terraform retain their safe and approval-required behavior", () => {
	for (const command of [
		"kubectl get pods",
		"kubectl logs deployment/api",
		"kubectl port-forward service/api 8080:80",
		"kubectl auth can-i get pods",
		"terraform plan",
		"terraform state list",
		"terraform workspace show",
	]) {
		assert.equal(evaluateCommandWithRm(command).allow, true, command);
	}

	for (const command of [
		"kubectl delete pod api",
		"kubectl get secrets",
		"kubectl rollout restart deployment/api",
		"terraform apply",
		"terraform destroy",
		"terraform output",
		'bash -lc "kubectl get pods"',
	]) {
		assert.equal(evaluateCommandWithRm(command).allow, false, command);
	}
});

test("approval is bound to the blocked execution context and consumed once", () => {
	let now = 1_000;
	const store = new ApprovalStore(() => now, () => "request-1");
	const identity = executionIdentity(
		"code-mode-exec-command",
		{ cmd: "rm -rf build", workdir: "project", shell: "zsh", tty: false },
		"/tmp",
	)!;
	const blocked = guardExecution(store, identity, "tui");
	assert.equal(blocked.allow, false);
	assert.equal(blocked.requestId, "request-1");
	assert.match(blocked.reason, /Approval request: request-1/);

	assert.deepEqual(store.approve("request-1", identity.command, "wrong reason"), {
		ok: false,
		error: "Approval request does not match the guard reason. Do not retry the command.",
	});
	assert.deepEqual(store.approve("request-1", identity.command, "rm command needs confirmation"), { ok: true });
	assert.equal(store.consume({ ...identity, cwd: "/tmp/other" }), false);
	assert.equal(store.consume({ ...identity, shell: "bash" }), false);
	assert.equal(store.consume(identity), true);
	assert.equal(store.consume(identity), false);

	now += 11 * 60 * 1000;
	assert.equal(store.consume(identity), false);
});

test("one approval cannot authorize two concurrent identical retries", () => {
	const store = new ApprovalStore(() => 1_000, () => "parallel-request");
	const identity = executionIdentity("exec-command", { cmd: "terraform apply" }, "/tmp")!;
	const blocked = guardExecution(store, identity, "tui");
	assert.equal(blocked.allow, false);
	assert.deepEqual(
		store.approve("parallel-request", identity.command, "terraform apply is not on the low-risk allowlist"),
		{ ok: true },
	);
	assert.deepEqual([store.consume(identity), store.consume(identity)].sort(), [false, true]);
});

test("legacy approval calls infer only one unambiguous pending request", () => {
	let nextId = 0;
	const store = new ApprovalStore(() => 1_000, () => `request-${++nextId}`);
	const first = executionIdentity("exec-command", { cmd: "rm target" }, "/tmp/one")!;
	guardExecution(store, first, "tui");
	assert.deepEqual(store.approve(undefined, first.command, "rm command needs confirmation"), { ok: true });
	assert.equal(store.consume(first), true);

	guardExecution(store, first, "tui");
	const second = { ...first, cwd: "/tmp/two" };
	guardExecution(store, second, "tui");
	assert.deepEqual(store.validate(undefined, first.command, "rm command needs confirmation"), {
		ok: false,
		error: "Multiple pending approvals match this command. Retry the blocked shell call and pass its request_id.",
	});
});

test("approval requests expire", () => {
	let now = 5_000;
	const store = new ApprovalStore(() => now, () => "expiring-request");
	const identity = executionIdentity("exec-command", { cmd: "rm old" }, "/tmp")!;
	guardExecution(store, identity, "tui");
	now += 11 * 60 * 1000;
	assert.deepEqual(store.approve("expiring-request", identity.command, "rm command needs confirmation"), {
		ok: false,
		error: "Approval request is missing or expired. Retry the blocked shell call to create a new request.",
	});
});

test("non-TUI calls fail closed without creating an unusable approval request", () => {
	const store = new ApprovalStore(() => 1_000, () => "must-not-be-created");
	const identity = executionIdentity("exec-command", { cmd: "rm target" }, "/tmp")!;
	const guarded = guardExecution(store, identity, "rpc");
	assert.equal(guarded.allow, false);
	assert.equal(guarded.requestId, undefined);
	assert.match(guarded.reason, /Approval is unavailable outside TUI mode/);
	assert.doesNotMatch(guarded.reason, /approve_infra_command/);
});

test("interactive interpreters are denied rather than approvable", () => {
	const store = new ApprovalStore(() => 1_000, () => "unused-request");
	for (const command of ["bash", "sudo /bin/zsh", "env python3.12", "exec node"]) {
		const identity = executionIdentity("code-mode-exec-command", { cmd: command, tty: true }, "/tmp")!;
		const guarded = guardExecution(store, identity, "tui");
		assert.equal(guarded.allow, false, command);
		assert.equal(guarded.requestId, undefined, command);
		assert.match(guarded.reason, /write_stdin input cannot be classified reliably/, command);
	}
	const nonInteractive = executionIdentity("code-mode-exec-command", { cmd: "bash -lc 'printf safe'" }, "/tmp")!;
	assert.deepEqual(guardExecution(store, nonInteractive, "tui"), { allow: true });
});

test("Code Mode provider wrapper blocks before invoke and reads the current reload bridge", async () => {
	let invokeCount = 0;
	const provider = {
		getTools() {
			return [
				{
					name: "exec_command",
					async invoke() {
						invokeCount += 1;
						return "ran";
					},
				},
			];
		},
	};
	const events: Record<PropertyKey, unknown> = {
		[CODE_MODE_RUNTIME_KEY]: { runtime: { providers: new Map([[{}, provider]]) } },
	};
	events[CODE_MODE_GUARD_BRIDGE_KEY] = () => {
		throw new Error("blocked by test bridge");
	};

	assert.deepEqual(ensureCodeModeGuardInstalled(events, { cwd: "/tmp" }), { ok: true });
	const firstTool = provider.getTools()[0]!;
	assert.equal(Boolean(firstTool[CODE_MODE_TOOL_WRAPPED]), true);
	await assert.rejects(firstTool.invoke({ cmd: "rm target" }, { cwd: "/tmp" }), /blocked by test bridge/);
	assert.equal(invokeCount, 0);

	let bridgeCount = 0;
	events[CODE_MODE_GUARD_BRIDGE_KEY] = () => {
		bridgeCount += 1;
	};
	assert.equal(await firstTool.invoke({ cmd: "printf safe" }, { cwd: "/tmp" }), "ran");
	assert.equal(bridgeCount, 1);
	assert.equal(invokeCount, 1);

	delete events[CODE_MODE_GUARD_BRIDGE_KEY];
	await assert.rejects(firstTool.invoke({ cmd: "printf safe" }, { cwd: "/tmp" }), /bridge is unavailable/);
	assert.equal(invokeCount, 1);
});

test("Code Mode integration fails closed when private runtime internals are unavailable", () => {
	assert.deepEqual(ensureCodeModeGuardInstalled({}, { cwd: "/tmp" }), {
		ok: false,
		reason: "Code Mode runtime was not found",
	});
	assert.deepEqual(
		ensureCodeModeGuardInstalled({ [CODE_MODE_RUNTIME_KEY]: { runtime: {} } }, { cwd: "/tmp" }),
		{ ok: false, reason: "Code Mode provider registry has an unsupported shape" },
	);
});

test("extension outer exec hook installs the nested guard before Code Mode collects tools", async () => {
	let invokeCount = 0;
	const provider = {
		getTools() {
			return [
				{
					name: "exec_command",
					async invoke() {
						invokeCount += 1;
					},
				},
			];
		},
	};
	const events: Record<PropertyKey, unknown> = {
		[CODE_MODE_RUNTIME_KEY]: { runtime: { providers: new Map([[{}, provider]]) } },
	};
	const handlers = new Map<string, Array<(event: any, context: any) => unknown>>();
	const pi = {
		events,
		registerTool() {},
		on(name: string, handler: (event: any, context: any) => unknown) {
			handlers.set(name, [...(handlers.get(name) ?? []), handler]);
		},
	};
	createExtension(pi as never);
	const context = { cwd: "/tmp", mode: "tui" };
	for (const handler of handlers.get("before_agent_start") ?? []) {
		assert.equal(await handler({}, context), undefined);
	}
	const preparedNested = provider.getTools()[0]!;
	await assert.rejects(
		preparedNested.invoke(
			{ cmd: "rm prepared-target" },
			{ cwd: "/tmp", extensionContext: context },
		),
		/Approval request:/,
	);
	assert.equal(invokeCount, 0);
	for (const handler of handlers.get("tool_call") ?? []) {
		assert.equal(await handler({ toolName: "exec", input: { code: "dynamic" } }, context), undefined);
	}
	const nested = provider.getTools()[0]!;
	await assert.rejects(
		nested.invoke(
			{ cmd: "rm guarded-target" },
			{ cwd: "/tmp", extensionContext: context },
		),
		/Approval request:/,
	);
	assert.equal(invokeCount, 0);
});

let failures = 0;
for (const testCase of tests) {
	try {
		await testCase.run();
		process.stdout.write(`ok - ${testCase.name}\n`);
	} catch (error) {
		failures += 1;
		process.stderr.write(`not ok - ${testCase.name}\n${error instanceof Error ? error.stack : String(error)}\n`);
	}
}
if (failures > 0) process.exitCode = 1;
