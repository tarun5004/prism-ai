import assert from 'node:assert/strict';
import { afterEach, mock, test } from 'node:test';
import { loadAnalysis, loadRecentAnalyses, createAnalysis } from '../src/features/dashboard/analysis.api.js';

afterEach(() => mock.restoreAll());
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
