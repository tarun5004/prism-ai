import assert from 'node:assert/strict';

test('notification preference saves only a boolean and rejects unsafe or failed responses', async () => {
  const { setEmailNotifications } = await import('../src/features/dashboard/analysis.api.js');
  const request = mock.method(globalThis, 'fetch', async (url, options) => {
    assert.equal(url, '/api/github/notifications/email');
    assert.equal(options.credentials, 'include');
    assert.deepEqual(JSON.parse(options.body), { enabled: true });
    return Response.json({ enabled: true });
  });
  assert.deepEqual(await setEmailNotifications(true), { enabled: true });
  request.mock.mockImplementation(async () => Response.json({ enabled: 'yes' }));
  await assert.rejects(setEmailNotifications(true), /notification/i);
  request.mock.mockImplementation(async () => Response.json({}, { status: 503 }));
  await assert.rejects(setEmailNotifications(false), /notification/i);
});
import { afterEach, mock, test } from 'node:test';
import { loadAnalysis, loadRecentAnalyses, loadSampleAnalysis, createAnalysis, saveFindingFeedback, loadDemoAnalysis } from '../src/features/dashboard/analysis.api.js';

afterEach(() => mock.restoreAll());

test('accepted reviews poll saved job status without a second POST and can resume by report URL', async () => {
  const id = 'webhook-' + 'a'.repeat(64);
  const report = { id, status: 'completed', pullRequest: {}, findings: [] };
  let polls = 0; let posts = 0; const stages = []; let acceptedId;
  const request = mock.method(globalThis, 'fetch', async (url, options) => {
    if (options?.method === 'POST') { posts++; return Response.json({ id, status: 'queued' }, { status: 202 }); }
    if (url.endsWith('/job')) return Response.json({ id, status: ++polls === 1 ? 'running' : 'completed' });
    return polls >= 2 ? Response.json(report) : Response.json({ message: 'Analysis not found.' }, { status: 404 });
  });
  assert.deepEqual(await createAnalysis('https://github.com/a/b/pull/1', { onAccepted: value => { acceptedId = value; }, onProgress: stage => stages.push(stage), wait: async () => {} }), report);
  assert.equal(acceptedId, id);
  assert.equal(posts, 1);
  assert.deepEqual(stages, ['queued', 'running']);
  polls = 0;
  assert.deepEqual(await loadAnalysis(id, { wait: async () => {} }), report);
  assert.equal(posts, 1, 'Reloading a pending report must not start another review');
  assert.ok(request.mock.calls.every(call => call.arguments[1]?.credentials === 'include'));
});

test('job polling is bounded, cancellable and rejects terminal failures or invalid states', async () => {
  const id = 'webhook-' + 'b'.repeat(64);
  let status = 'queued'; let calls = 0;
  mock.method(globalThis, 'fetch', async url => {
    calls++;
    return url.endsWith('/job') ? Response.json({ id, status }) : Response.json({}, { status: 404 });
  });
  await assert.rejects(loadAnalysis(id, { wait: async () => {}, maxPolls: 2 }), /still.*progress|still.*queued/i);
  assert.equal(calls, 3, 'One report lookup and two bounded job lookups');
  for (const value of ['unknown', 'failed', 'skipped', 'invented']) {
    status = value;
    await assert.rejects(loadAnalysis(id, { wait: async () => {} }), /interrupted|failed|skipped|invalid/i);
  }
  status = 'queued';
  const abort = new AbortController();
  await assert.rejects(loadAnalysis(id, { signal: abort.signal, wait: async () => { abort.abort(); } }), /cancelled/i);
  const before = calls;
  await assert.rejects(loadAnalysis(id, { signal: abort.signal }), /cancelled/i);
  assert.equal(calls, before, 'An already cancelled read makes no request');
});

test('public demo reads its fixed endpoint and rejects a private report-shaped response', async () => {
  const report = { id: 'demo-b01', status: 'completed', pullRequest: {}, findings: [], sample: { readOnly: true } };
  const request = mock.method(globalThis, 'fetch', async url => { assert.equal(url, '/api/demo/report'); return Response.json(report); });
  assert.deepEqual(await loadDemoAnalysis(), report);
  request.mock.mockImplementation(async () => Response.json({ ...report, sample: undefined }));
  await assert.rejects(loadDemoAnalysis(), /sample/i);
});

test('feedback uses original finding index and same-origin authenticated requests', async () => {
  const report = { id: 'one', status: 'completed', pullRequest: {}, findings: [] };
  const request = mock.method(globalThis, 'fetch', async () => Response.json(report));
  assert.deepEqual(await saveFindingFeedback('one', 3, 'incorrect', 'Wrong assumption'), report);
  const [url, options] = request.mock.calls[0].arguments;
  assert.equal(url, '/api/analyses/one/findings/3/feedback');
  assert.equal(options.credentials, 'include');
  assert.equal(options.method, 'PUT');
  assert.equal(JSON.parse(options.body).verdict, 'incorrect');
});

test('sample review reads saved history once, prefers an AI review and handles empty/error states', async () => {
  const rules = { id: 'rules', status: 'completed', pullRequest: {}, findings: [] };
  const ai = { ...rules, id: 'ai', aiStatus: 'partial', aiReview: { summary: 'Saved review' } };
  const request = mock.method(globalThis, 'fetch', async (_url, options) => {
    assert.equal(options?.method, undefined, 'Sample must never create an analysis');
    return Response.json([{ ...rules, id: 'failed', status: 'failed' }, rules, ai]);
  });
  assert.deepEqual(await loadSampleAnalysis(), ai);
  assert.equal(request.mock.callCount(), 1);
  request.mock.mockImplementation(async () => Response.json([rules]));
  assert.deepEqual(await loadSampleAnalysis(), rules);
  request.mock.mockImplementation(async () => Response.json([{ ...rules, status: 'failed' }]));
  assert.equal(await loadSampleAnalysis(), null);
  request.mock.mockImplementation(async () => Response.json([{ ...rules, id: '../bad' }]));
  assert.equal(await loadSampleAnalysis(), null);
  request.mock.mockImplementation(async () => { throw new Error('offline'); });
  await assert.rejects(loadSampleAnalysis(), /backend is running/);
});
test('report/history requests reject HTTP failures and malformed responses', async () => {
  const request = mock.method(globalThis, 'fetch', async () => Response.json({ message: 'Analysis not found.' }, { status: 404 }));
  await assert.rejects(loadAnalysis('missing'), /Analysis not found/);
  request.mock.mockImplementation(async () => new Response('<html>Bad gateway</html>', { status: 502 }));
  await assert.rejects(loadRecentAnalyses(), /could not be loaded/);
  request.mock.mockImplementation(async () => Response.json({}));
  await assert.rejects(loadRecentAnalyses(), /invalid response/);
  await assert.rejects(loadAnalysis('a'), /invalid response/);
});
test('creates reports and encodes history IDs without changing diff data', async () => {
  const report = { id: 'one', status: 'completed', pullRequest: { changedFiles: [{ path: 'a.js', patch: '+hello' }] }, findings: [] };
  const request = mock.method(globalThis, 'fetch', async () => Response.json(report));
  assert.deepEqual(await createAnalysis('https://github.com/a/b/pull/1'), report);
  assert.equal(request.mock.calls[0].arguments[1].method, 'POST');
  await loadAnalysis('a/b');
  assert.ok(request.mock.calls[1].arguments[0].endsWith('/a%2Fb'));
});
test('network failures show a useful safe error', async () => {
  mock.method(globalThis, 'fetch', async () => { throw Error('internal socket details'); });
  await assert.rejects(loadAnalysis('a'), /backend is running/);
});

function responseStream(pieces) {
  return new Response(new ReadableStream({ start(controller) {
    const bytes = new TextEncoder().encode(pieces);
    // Split every byte, including multi-byte UTF-8 and JSON/newline boundaries.
    for (const byte of bytes) controller.enqueue(Uint8Array.of(byte));
    controller.close();
  } }), { headers: { 'Content-Type': 'application/x-ndjson; charset=utf-8' } });
}

const streamedReport = { id: 'stream', status: 'completed', pullRequest: { title: 'सही review', changedFiles: [] }, findings: [], aiStatus: 'unavailable' };

test('streams stage updates before the terminal result and preserves UTF-8', async () => {
  const stages = [];
  const request = mock.method(globalThis, 'fetch', async (_url, options) => {
    assert.equal(options.headers.Accept, 'application/x-ndjson');
    return responseStream(JSON.stringify({ type: 'progress', stage: 'fetching' }) + '\r\n'
      + JSON.stringify({ type: 'progress', stage: 'reviewing' }) + '\n' + JSON.stringify({ type: 'result', report: streamedReport }));
  });
  assert.deepEqual(await createAnalysis('https://github.com/a/b/pull/1', { onProgress: stage => stages.push(stage) }), streamedReport);
  assert.deepEqual(stages, ['fetching', 'reviewing']);
  assert.equal(request.mock.callCount(), 1);
});

test('rejects incomplete streams, invalid frames and streamed errors without retrying', async () => {
  const request = mock.method(globalThis, 'fetch', async () => responseStream(''));
  for (const body of [
    '{"type":"progress","stage":"fetching"}\n',
    '{"type":"progress","stage":"made-up"}\n',
    'not json\n',
    '{"type":"result","report":{}}\n'
  ]) {
    request.mock.mockImplementation(async () => responseStream(body));
    await assert.rejects(createAnalysis('url', { onProgress() {} }), /progress|report|connection/i);
  }
  request.mock.mockImplementation(async () => responseStream('{"type":"error","message":"GitHub denied access."}\n'));
  await assert.rejects(createAnalysis('url', { onProgress() {} }), /GitHub denied access/);
  assert.equal(request.mock.callCount(), 5);
});

test('stream mode handles JSON validation errors and honors request cancellation', async () => {
  const abort = new AbortController();
  mock.method(globalThis, 'fetch', async (_url, options) => {
    assert.equal(options.signal, abort.signal);
    return Response.json({ message: 'Pull Request URL is required.' }, { status: 400 });
  });
  await assert.rejects(createAnalysis('', { onProgress() {}, signal: abort.signal }), /URL is required/);
});
