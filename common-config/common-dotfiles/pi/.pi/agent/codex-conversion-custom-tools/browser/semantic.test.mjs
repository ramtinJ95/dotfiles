import assert from 'node:assert/strict';
import test from 'node:test';
import { parseRequest, cliInvocation, formatLocalResult, executeOperation } from './browser.mjs';
import { systemOne, rankCandidates, safeUrl, redact, validateAnswers, mapConcurrent } from './typesafe.mjs';
import { semanticPage, findEvidence, verifyPage, semanticLines } from './semantic-page.mjs';
import { captureSnapshot } from './cdp-lib/snapshot.mjs';

function answer(request, { winner, fits = () => 0.98, confidence = 0.99 } = {}) {
  return {
    answers: Object.fromEntries(Object.entries(request.questions).map(([id, question]) => {
      if (question.type === 'noul') return [id, { type: 'noul', noul: fits(id) }];
      const choice = winner || Object.keys(question.criteria)[0];
      return [id, { type: 'choice', choice, confidence, probabilities: Object.fromEntries(Object.keys(question.criteria).map(key => [key, key === choice ? 1 : 0])) }];
    })),
    telemetry: { model: 'test', requests: 1, inference_ms: 1, input_tokens: 100, output_tokens: 10 },
  };
}

function fakeCDP({ mutate = () => {} } = {}) {
  let snapshots = 0;
  const calls = [];
  return {
    calls,
    async send(method, params) {
      calls.push({ method, params });
      if (method === 'Accessibility.getFullAXTree') {
        const nodes = [
          { nodeId: 'root', role: { value: 'RootWebArea' }, name: { value: '' }, childIds: ['heading', 'text', 'search', 'button'] },
          { nodeId: 'heading', parentId: 'root', role: { value: 'heading' }, name: { value: 'Invoices' } },
          { nodeId: 'text', parentId: 'root', role: { value: 'StaticText' }, name: { value: 'Invoice INV-1042 is paid.' } },
          { nodeId: 'search', parentId: 'root', backendDOMNodeId: 41, role: { value: 'searchbox' }, name: { value: 'Filter invoices' }, value: { value: 'PRIVATE-FORM-VALUE' } },
          { nodeId: 'button', parentId: 'root', backendDOMNodeId: 42, role: { value: 'button' }, name: { value: 'Download statement' } },
        ];
        mutate(nodes, ++snapshots);
        return { nodes };
      }
      if (method === 'Runtime.enable') return {};
      if (method === 'Runtime.evaluate') return { result: { value: { title: 'Billing', url: 'https://example.com/invoices?token=PRIVATE-URL-TOKEN' } } };
      throw new Error(`Unexpected CDP call: ${method}`);
    },
  };
}

const page = {
  ref_id: 'ABCDEF12', title: 'Account terms', url: 'https://example.com/terms',
  content: [
    { line: 1, kind: 'heading', text: 'heading: Membership' },
    { line: 2, kind: 'text', text: 'Ending your subscription early costs $25. There is no charge after the first year.' },
    { line: 3, kind: 'interactive', text: '[7] button End membership', element_id: 7 },
    { line: 4, kind: 'text', text: 'To keep your membership, no action is necessary.' },
    { line: 5, kind: 'heading', text: 'heading: Privacy' },
    { line: 6, kind: 'text', text: 'We do not sell personal information.' },
  ],
  elements: [{ id: 7, role: 'button', name: 'End membership' }],
};

test('semantic syntax covers tabs, evidence, all target actions, and verification', async () => {
  const parsed = parseRequest(JSON.stringify({
    tabs: [{ query: 'billing dashboard' }],
    open: [{ url: 'https://example.com', query: 'cancellation fees' }],
    find: [{ ref_id: 'ABCDEF12', query: 'what does ending early cost?' }],
    click: [{ ref_id: 'ABCDEF12', target: 'download invoice' }],
    type: [{ ref_id: 'ABCDEF12', target: 'invoice search', text: 'INV-1042' }],
    html: [{ ref_id: 'ABCDEF12', target: 'download invoice' }],
    screenshot: [{ ref_id: 'ABCDEF12', target: 'download invoice' }],
    verify: [{ ref_id: 'ABCDEF12', claims: ['Invoice is paid', 'There is a download button'] }],
  }));
  assert.equal(parsed.operations.length, 8);
  for (const request of parsed.operations.filter(request => request.ref_id)) {
    const invocation = await cliInvocation(request);
    assert.equal(invocation.args[0], 'semantic');
    assert.equal(JSON.parse(invocation.args[2]).action, request.action);
    if (request.action === 'screenshot') assert.ok(invocation.file.endsWith('.png'));
  }
  assert.equal((await cliInvocation({ action: 'find', ref_id: 'ABCDEF12', pattern: 'literal', lineno: 1, response_length: 'short' })).args[0], 'find');
  for (const invalid of [
    { find: [{ ref_id: 'ABCDEF12', query: 'x', pattern: 'x' }] },
    { tabs: [{ query: 'x', pattern: 'x' }] },
    { click: [{ ref_id: 'ABCDEF12', target: 'x', id: 1 }] },
    { type: [{ ref_id: 'ABCDEF12', target: 'x', id: 1, text: 'x' }] },
    { html: [{ ref_id: 'ABCDEF12', target: 'x', selector: 'a' }] },
    { screenshot: [{ ref_id: 'ABCDEF12', target: 'x', id: 1 }] },
    { verify: [{ ref_id: 'ABCDEF12', claims: [] }] },
  ]) assert.throws(() => parseRequest(JSON.stringify(invalid)));
});

test('HTTP contract, strict answers, redaction, missing credentials, and service errors', async () => {
  const questions = { exists: { type: 'noul', instructions: 'Is this paid?' } };
  const response = await systemOne({ state: { text: 'api_key=secret-value', quoted: 'a "quoted" value' }, questions }, {
    apiKey: 'unit-test-key',
    fetchImpl: async (url, init) => {
      assert.equal(url, 'https://api.typesafe.ai/v1/systemone');
      assert.equal(init.headers.Authorization, 'Bearer unit-test-key');
      assert.equal(init.redirect, 'error');
      const body = JSON.parse(init.body);
      assert.equal(body.state.text, 'api_key=[REDACTED]');
      assert.equal(body.state.quoted, 'a "quoted" value');
      return { ok: true, json: async () => ({ model: 'test', answers: { exists: { type: 'noul', noul: 0.9 } }, usage: { input_tokens: 20, output_tokens: 3 } }) };
    },
  });
  assert.equal(response.telemetry.input_tokens, 20);
  await assert.rejects(systemOne({ state: '', questions }, { apiKey: '' }), /TYPESAFE_API_KEY/);
  await assert.rejects(systemOne({ state: 'x'.repeat(100_000), questions }, { apiKey: 'test' }), /96 KB/);
  await assert.rejects(systemOne({ state: '', questions }, { apiKey: 'test', fetchImpl: async () => ({ ok: false, status: 429 }) }), /HTTP 429/);
  await assert.rejects(systemOne({ state: '', questions }, { apiKey: 'test', fetchImpl: async () => { throw new DOMException('private text', 'TimeoutError'); } }), /TimeoutError/);
  await assert.rejects(systemOne({ state: '', questions }, { apiKey: 'test', fetchImpl: async () => ({ ok: true, json: async () => { throw new Error(); } }) }), /invalid JSON/);
  assert.throws(() => validateAnswers(questions, { exists: { type: 'noul', noul: 2 } }), /probability/);
  assert.throws(() => validateAnswers({ target: { type: 'choice', criteria: { a: null, none: null } } }, { target: { type: 'choice', choice: 'invented', confidence: 1, probabilities: { invented: 1 } } }), /invalid choice/);
  assert.equal(safeUrl('https://user:pass@example.com/page?token=secret#private'), 'https://example.com/page');
  assert.equal(redact('Bearer abcdef123456'), 'Bearer [REDACTED]');
});

test('candidate groups cover large inputs, batch independent questions, and cap concurrency', async () => {
  const seen = new Set();
  let active = 0;
  let maximum = 0;
  const candidates = Array.from({ length: 600 }, (_, i) => ({ id: `c${i}`, text: `Evidence ${i}` }));
  const result = await rankCandidates('evidence', candidates, { evaluate: async request => {
    maximum = Math.max(maximum, ++active);
    assert.ok(Buffer.byteLength(JSON.stringify(request)) < 96_000);
    for (const candidate of request.state.candidates) seen.add(candidate.id);
    await new Promise(resolve => setTimeout(resolve, 2));
    active--;
    return answer(request, { fits: id => id === 'fit_c599' ? 0.99 : 0.01 });
  } });
  assert.equal(seen.size, 600);
  assert.equal(maximum, 4);
  assert.equal(result.ranked[0].id, 'c599');
  assert.equal(result.telemetry.requests, 10);
  assert.equal((await rankCandidates('x', [], { select: true })).selection, null);
});

test('cross-group targeting reselects finalists using one shared Choice', async () => {
  const requests = [];
  const result = await rankCandidates('last', Array.from({ length: 150 }, (_, i) => ({ id: `e${i}`, name: `Element ${i}` })), {
    select: true,
    evaluate: async request => {
      requests.push(request);
      const last = request.state.candidates.some(candidate => candidate.id === 'e149');
      return answer(request, { winner: last ? 'e149' : 'none', fits: id => id === 'fit_e149' ? 0.99 : 0.01 });
    },
  });
  assert.equal(requests.length, 4);
  assert.equal(Object.keys(requests.at(-1).questions).length, 1);
  assert.equal(result.selection.id, 'e149');
  assert.equal(result.selection.probability, 0.99);
});

test('failure drains active inference rather than leaking background work', async () => {
  let active = 0;
  await assert.rejects(mapConcurrent([0, 1, 2, 3, 4], async i => {
    active++;
    try {
      if (i === 0) throw new Error('service failed');
      await new Promise(resolve => setTimeout(resolve, 5));
    } finally { active--; }
  }), /service failed/);
  assert.equal(active, 0);
});

test('evidence preserves original lines, element refs, relevance and bounded output', async () => {
  const result = await findEvidence(page, { query: 'cancellation fees', response_length: 'short' }, async request => answer(request, { fits: id => id === 'fit_s0' ? 0.98 : 0.01 }));
  assert.equal(result.semantic.status, 'matched');
  assert.equal(result.semantic.candidates_evaluated, 2);
  assert.equal(result.content[1].text, page.content[1].text);
  assert.equal(result.elements[0].id, 7);
  const bounded = await formatLocalResult({ action: 'find', ref_id: page.ref_id, query: 'cancellation fees' }, JSON.stringify(result));
  assert.deepEqual(bounded.semantic, result.semantic);
  assert.equal(bounded.query, 'cancellation fees');
  const none = await findEvidence(page, { query: 'rocket fuel' }, async request => answer(request, { fits: () => 0.01 }));
  assert.equal(none.semantic.status, 'not_found');
  assert.deepEqual(none.content, []);
});

test('tab queries rank semantically, preserve source refs, and expose uncertainty', async () => {
  const tabs = [{ ref_id: 'A', title: 'News', url: 'https://example.com/news' }, { ref_id: 'B', title: 'Accounts receivable', url: 'https://example.com/finance' }];
  const result = await formatLocalResult({ action: 'tabs', query: 'unpaid invoices', offset: 0 }, JSON.stringify(tabs), undefined, {
    evaluate: async request => answer(request, { fits: id => id === 'fit_t1' ? 0.95 : 0.1 }),
  });
  assert.equal(result.tabs[0].ref_id, 'B');
  assert.equal(result.tabs.length, 1);
  assert.equal(result.semantic.requests, 1);
});

test('targeting excludes form values and typing payload; resolves and executes in one operation', async () => {
  const cdp = fakeCDP();
  const refs = new Map();
  let actions = 0;
  const result = await semanticPage(cdp, 'sid', refs, { action: 'type', ref_id: 'ABCDEF12', target: 'invoice filter', text: 'PRIVATE-TYPING-PAYLOAD' }, {
    evaluate: async request => {
      assert.doesNotMatch(JSON.stringify(request), /PRIVATE/);
      assert.equal(request.state.candidates.length, 1);
      assert.equal(Object.keys(request.questions).length, 2);
      return answer(request);
    },
    actions: { type: async (_cdp, _sid, currentRefs, id, request) => {
      actions++;
      assert.equal(currentRefs.get(id), 41);
      assert.equal(request.text, 'PRIVATE-TYPING-PAYLOAD');
      return 'Typed';
    } },
  });
  assert.equal(actions, 1);
  assert.equal(result.id, 1);
  assert.equal(result.semantic.requests, 1);
  assert.equal(cdp.calls.filter(call => call.method === 'Accessibility.getFullAXTree').length, 2);
  assert.equal(refs.get(1), 41);
});

test('no-match, ambiguity, service failure, replaced nodes, and changed context never execute actions', async () => {
  for (const mode of ['none', 'ambiguous', 'low-fit', 'service', 'replacement', 'context']) {
    let actions = 0;
    const cdp = fakeCDP({ mutate: (nodes, count) => {
      if (count === 2 && mode === 'replacement') nodes.find(node => node.nodeId === 'search').backendDOMNodeId = 99;
      if (count === 2 && mode === 'context') nodes.find(node => node.nodeId === 'text').name.value = 'Different customer invoice';
    } });
    await assert.rejects(semanticPage(cdp, 'sid', new Map(), { action: 'type', ref_id: 'ABCDEF12', target: 'invoice filter', text: 'hello' }, {
      evaluate: async request => {
        if (mode === 'service') throw new Error('service unavailable');
        return answer(request, { winner: mode === 'none' ? 'none' : undefined, confidence: mode === 'ambiguous' ? 0.1 : 0.99, fits: () => mode === 'low-fit' ? 0.1 : 0.98 });
      },
      actions: { type: async () => { actions++; } },
    }), mode === 'service' ? /service unavailable/ : ['replacement', 'context'].includes(mode) ? /changed during/ : /ambiguous|not found/);
    assert.equal(actions, 0, mode);
  }
});

test('snapshot suppresses protected values and verification batches claims on one capture', async () => {
  const cdp = fakeCDP({ mutate: nodes => { nodes.find(node => node.nodeId === 'search').properties = [{ name: 'protected', value: { value: true } }]; } });
  const snapshot = await captureSnapshot(cdp, 'sid', new Map(), 'ABCDEF12');
  assert.doesNotMatch(JSON.stringify(snapshot), /PRIVATE-FORM/);
  assert.doesNotMatch(JSON.stringify(semanticLines(snapshot)), /PRIVATE-FORM/);
  const verification = await verifyPage(snapshot, ['Invoice is paid', 'Invoice is overdue'], async request => {
    assert.equal(Object.keys(request.questions).length, 2);
    return answer(request, { fits: id => id === 'c0' ? 0.99 : 0.01 });
  });
  assert.deepEqual(verification.checks.map(check => check.status), ['supported', 'unsupported']);
});

test('semantic HTML and screenshot results retain normal output contracts', async () => {
  const html = await formatLocalResult({ action: 'html', ref_id: 'ABCDEF12', target: 'invoice' }, JSON.stringify({ id: 7, result: '<a>Invoice</a>', semantic: { requests: 1 } }));
  assert.equal(html.html, '<a>Invoice</a>');
  assert.equal(html.id, 7);
  const shot = await formatLocalResult({ action: 'screenshot', ref_id: 'ABCDEF12', target: 'invoice' }, JSON.stringify({ id: 7, result: 'Device pixel ratio (DPR): 2', semantic: { requests: 1 } }), '/tmp/fixture.png');
  assert.equal(shot.file, '/tmp/fixture.png');
  assert.equal(shot.dpr, 2);
  assert.equal(shot.id, 7);
});

test('opening a URL returns evidence without a second Pi tool call', async () => {
  const commands = [];
  const result = await executeOperation({ action: 'open', url: 'https://example.com', query: 'fees', lineno: 1, response_length: 'short' }, {
    run: async (_program, args) => {
      commands.push(args[1]);
      return { code: 0, stdout: args[1] === 'open' ? 'Opened new tab: ABCDEF12 https://example.com' : JSON.stringify({ ...page, lineno: 1, query: 'fees', semantic: { requests: 1 } }) };
    },
  });
  assert.deepEqual(commands, ['open', 'semantic']);
  assert.equal(result.ref_id, 'ABCDEF12');
  assert.equal(result.semantic.requests, 1);
});

test('target state and exact link destinations survive projection and are revalidated', async () => {
  let actions = 0;
  const cdp = fakeCDP({ mutate: (nodes, count) => {
    const node = nodes.find(node => node.nodeId === 'button');
    node.properties = [
      { name: 'disabled', value: { value: false } },
      { name: 'url', value: { value: `https://example.com/invoice?id=${count}` } },
    ];
  } });
  await assert.rejects(semanticPage(cdp, 'sid', new Map(), { action: 'click', ref_id: 'ABCDEF12', target: 'download statement' }, {
    evaluate: async request => {
      assert.equal(request.state.candidates.find(candidate => candidate.id === 'e2').states.disabled, false);
      assert.equal(request.state.candidates.find(candidate => candidate.id === 'e2').url, 'https://example.com/invoice');
      return answer(request, { winner: 'e2' });
    },
    actions: { click: async () => { actions++; } },
  }), /changed during/);
  assert.equal(actions, 0);
});

test('partial opens and old daemons report actionable errors without retries', async () => {
  let calls = 0;
  await assert.rejects(executeOperation({ action: 'open', url: 'https://example.com', query: 'fees', lineno: 1, response_length: 'short' }, {
    run: async (_program, args) => {
      calls++;
      if (args[1] === 'open') return { code: 0, stdout: 'Opened new tab: ABCDEF12 https://example.com' };
      assert.equal(JSON.parse(args[3]).wait_ready, true);
      return { code: 1, stderr: 'Error: Unknown command: semantic' };
    },
  }), /Tab ABCDEF12 was opened.*bridge predates TypeSafe.*Retry open with this ref_id/);
  assert.equal(calls, 2);
  assert.throws(() => parseRequest(JSON.stringify({ verify: [{ ref_id: 'ABCDEF12', claims: ['x'.repeat(17_000)] }] })), /16 KB/);
});

test('cancellation during inference or target validation prevents late actions', async () => {
  for (const during of ['inference', 'validation']) {
    const controller = new AbortController();
    let actions = 0;
    const cdp = fakeCDP({ mutate: (_nodes, count) => {
      if (count === 2 && during === 'validation') controller.abort();
    } });
    await assert.rejects(semanticPage(cdp, 'sid', new Map(), { action: 'type', ref_id: 'ABCDEF12', target: 'invoice filter', text: 'hello' }, {
      signal: controller.signal,
      evaluate: async request => {
        if (during === 'inference') controller.abort();
        return answer(request);
      },
      actions: { type: async () => { actions++; } },
    }), { name: 'AbortError' });
    assert.equal(actions, 0);
  }
});

test('LIVE TypeSafe: semantic evidence, target selection, tab ranking and verification', { skip: process.env.BROWSER_LIVE_TYPESAFE !== '1' }, async t => {
  const timings = [];
  for (let i = 0; i < 3; i++) {
    const result = await findEvidence(page, { query: 'What are the cancellation fees?', response_length: 'short' });
    assert.equal(result.semantic.status, 'matched');
    assert.ok(result.content.some(line => line.text.includes('$25')));
    timings.push(result.semantic.inference_ms);
  }
  const target = await rankCandidates('the field where I can look up a bill', [
    { id: 'e1', role: 'searchbox', name: 'Filter invoices', context: ['Billing'] },
    { id: 'e2', role: 'button', name: 'Pay now', context: ['Billing'] },
    { id: 'e3', role: 'textbox', name: 'Your name', context: ['Profile'] },
  ], { intent: 'selecting the existing browser element to type into', select: true });
  assert.equal(target.selection.id, 'e1');
  assert.ok(target.selection.probability >= 0.7);
  assert.ok(target.selection.confidence >= 0.65);
  const missing = await rankCandidates('launch a spacecraft', [{ id: 'e1', role: 'button', name: 'Download invoice' }], { select: true });
  assert.equal(missing.selection.id, null);
  const tabs = await formatLocalResult({ action: 'tabs', query: 'Where can I check unpaid customer bills?', offset: 0 }, JSON.stringify([
    { ref_id: 'A', title: 'News', url: 'https://example.com/news' },
    { ref_id: 'B', title: 'Accounts receivable', url: 'https://example.com/finance' },
  ]));
  assert.equal(tabs.tabs[0].ref_id, 'B');
  const verified = await verifyPage(page, ['Ending a subscription early costs $25', 'The company sells personal information']);
  assert.deepEqual(verified.checks.map(check => check.status), ['supported', 'unsupported']);
  t.diagnostic(JSON.stringify({ scope: 'synthetic fixtures, real TypeSafe API; inference only, not end-to-end Pi', evidence_ms: timings, target_ms: target.telemetry.inference_ms, tabs_ms: tabs.semantic.inference_ms, verify_ms: verified.semantic.inference_ms }));
});
