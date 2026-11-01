import assert from 'node:assert/strict';
import { afterEach, mock, test } from 'node:test';
import { loadAnalysis, loadRecentAnalyses, loadSampleAnalysis, createAnalysis } from '../src/features/dashboard/analysis.api.js';

afterEach(() => mock.restoreAll());

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
