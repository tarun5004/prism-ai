import assert from 'node:assert/strict';
import { createHmac } from 'node:crypto';
import { afterEach, beforeEach, mock, test } from 'node:test';
import { createWebhookHandler } from '../src/features/pullRequest/pullRequest.webhook.js';
import { findAnalysis } from '../src/features/analysis/analysis.repository.js';

const secret = 'offline-webhook-secret';
const payload = { action: 'opened', number: 1, repository: { full_name: 'audit/repo' }, pull_request: { number: 1, state: 'open', draft: false, base: { sha: 'a'.repeat(40) }, head: { sha: 'b'.repeat(40) } } };
let previous;
beforeEach(() => {
  previous = [process.env.GITHUB_WEBHOOK_SECRET, process.env.GITHUB_WEBHOOK_REPOSITORY];
  process.env.GITHUB_WEBHOOK_SECRET = secret;
  process.env.GITHUB_WEBHOOK_REPOSITORY = 'audit/repo';
});
afterEach(() => {
  mock.restoreAll();
  ['GITHUB_WEBHOOK_SECRET', 'GITHUB_WEBHOOK_REPOSITORY'].forEach((key, index) => {
    if (previous[index] === undefined) delete process.env[key]; else process.env[key] = previous[index];
  });
});

function delivery(body = payload, event = 'pull_request') {
  const raw = Buffer.from(typeof body === 'string' ? body : JSON.stringify(body));
  return { body: raw, headers: { 'x-github-event': event, 'x-github-delivery': '12345678-1234-1234-1234-123456789abc', 'x-hub-signature-256': 'sha256=' + createHmac('sha256', secret).update(raw).digest('hex') } };
}
function response() {
  return { code: 200, status(code) { this.code = code; return this; }, json(body) { this.body = body; return this; } };
}
const tick = () => new Promise(resolve => setImmediate(resolve));

test('durable webhook acknowledges only after enqueue succeeds and never starts inline analysis', async () => {
  const previous = process.env.REVIEW_EXECUTION; process.env.REVIEW_EXECUTION = 'queue';
  try {
    let finish;
    const pending = new Promise(resolve => { finish = resolve; });
    const handler = createWebhookHandler({ enqueue: async job => { assert.equal(job.payload.options.trigger.actorId, '12'); await pending; }, analyze() { assert.fail('Queue mode must not review inline'); } });
    const res = response();
    const completion = handler(delivery({ ...payload, pull_request: { ...payload.pull_request, user: { id: 12 } } }), res);
    assert.equal(res.body, undefined);
    finish(); await completion;
    assert.equal(res.code, 202);
    assert.equal(res.body.status, 'accepted');
    const broken = createWebhookHandler({ enqueue: async () => { throw Error('private queue credential'); } });
    const failed = response(); await broken(delivery(), failed);
    assert.equal(failed.code, 503);
    assert.ok(!JSON.stringify(failed.body).includes('credential'));
  } finally { if (previous === undefined) delete process.env.REVIEW_EXECUTION; else process.env.REVIEW_EXECUTION = previous; }
});

test('queued review is claimed once, completed reports are reused and expired running work is not regenerated', async () => {
  const { processNextReview } = await import('../src/features/analysis/analysis.jobs.js');
  const { enqueueReviewJob, findReviewJob, claimReviewJob, finishReviewJob } = await import('../src/features/analysis/analysis.repository.js');
  const id = 'webhook-' + '7'.repeat(64);
  await enqueueReviewJob({ id, payload: { url: 'https://github.com/audit/repo/pull/1', options: { expectedRevision: { baseSha: 'a'.repeat(40), headSha: 'b'.repeat(40) } } } });
  let deletes = 0, calls = 0;
  const queue = { receiveMessages: async () => ({ receivedMessageItems: [{ messageId: 'm', popReceipt: 'p', messageText: Buffer.from(id).toString('base64') }] }), deleteMessage: async () => { deletes++; } };
  const analyze = async () => { calls++; return { status: 201, body: { status: 'completed' } }; };
  await processNextReview({ queue, analyze });
  await processNextReview({ queue, analyze });
  assert.equal(calls, 1); assert.equal(deletes, 2);
  assert.equal((await findReviewJob(id)).status, 'completed');
  const expiredId = 'webhook-' + '8'.repeat(64);
  await enqueueReviewJob({ id: expiredId, payload: { url: 'https://github.com/audit/repo/pull/1', options: {} } });
  await claimReviewJob(expiredId, 'worker-1', new Date(Date.now() - 1));
  assert.equal(await claimReviewJob(expiredId, 'worker-2'), null);
  assert.equal((await findReviewJob(expiredId)).status, 'unknown');
  await finishReviewJob(id, 'wrong-owner', 'failed');
  assert.equal((await findReviewJob(id)).status, 'completed');
});

test('rejects invalid signatures/configuration before any analysis or repository access', () => {
  const handler = createWebhookHandler({ analyze() { assert.fail('Must not analyze'); }, find() { assert.fail('Must not read storage'); } });
  for (const signature of [undefined, 'sha256=bad', 'sha256=' + '0'.repeat(64)]) {
    const req = delivery(); req.headers['x-hub-signature-256'] = signature;
    const res = response(); handler(req, res); assert.equal(res.code, 401);
  }
  const altered = delivery(); altered.body = Buffer.from('{}');
  const res = response(); handler(altered, res); assert.equal(res.code, 401);
  delete process.env.GITHUB_WEBHOOK_SECRET;
  handler(delivery(), res); assert.equal(res.code, 503);
});

test('ping, ignored actions, drafts and closed PRs never run analysis; invalid payloads are rejected', () => {
  const handler = createWebhookHandler({ analyze() { assert.fail('Must not analyze'); } });
  for (const req of [delivery({}, 'ping'), delivery({}, 'push'), delivery({ action: 'closed' }), delivery({ ...payload, pull_request: { ...payload.pull_request, draft: true } }), delivery({ ...payload, pull_request: { ...payload.pull_request, state: 'closed' } })]) {
    const res = response(); handler(req, res); assert.equal(res.code, 200);
  }
  for (const body of ['{bad json', { action: 'opened' }, { ...payload, number: -1 }, { ...payload, pull_request: { ...payload.pull_request, head: { sha: 'bad' } } }, { ...payload, pull_request: { ...payload.pull_request, head: { sha: { toString: 'bad' } } } }]) {
    const res = response(); handler(delivery(body), res); assert.equal(res.code, 400);
  }
  const res = response(); handler(delivery({ ...payload, repository: { full_name: 'someone/else' } }), res); assert.equal(res.code, 403);
});

test('acknowledges before analysis, deduplicates in-flight and persisted revisions, and passes provenance', async () => {
  let finish;
  const blocker = new Promise(resolve => { finish = resolve; });
  const reports = new Map();
  const calls = [];
  const handler = createWebhookHandler({ find: async id => reports.get(id), log() {}, analyze: async (url, options) => {
    calls.push({ url, options }); await blocker;
    const report = { id: options.id, status: 'completed' }; reports.set(options.id, report);
    return { status: 201, body: report };
  } });
  const res = response(); handler(delivery(), res);
  assert.equal(res.code, 202); assert.equal(calls.length, 0);
  const duplicate = response(); handler(delivery(), duplicate);
  assert.equal(duplicate.body.status, 'duplicate');
  await tick();
  assert.equal(calls.length, 1);
  assert.equal(calls[0].url, 'https://github.com/audit/repo/pull/1');
  assert.equal(calls[0].options.expectedRevision.headSha, payload.pull_request.head.sha);
  assert.equal(calls[0].options.trigger.type, 'github_webhook');
  finish(); await tick();
  const fresh = createWebhookHandler({ find: async id => reports.get(id), analyze() { assert.fail('Persisted duplicate'); }, log() {} });
  const replay = response(); fresh(delivery({ ...payload, action: 'synchronize' }), replay); await tick();
  assert.equal(replay.body.analysisId, res.body.analysisId);
});

test('bounds active jobs and releases failed jobs without logging private errors', async () => {
  let release;
  const pending = new Promise(resolve => { release = resolve; });
  const logs = [];
  const handler = createWebhookHandler({ find: async () => null, analyze: async () => { await pending; throw Error('private-provider-secret'); }, log: value => logs.push(value) });
  for (const number of [1, 2, 3]) {
    const res = response(); handler(delivery({ ...payload, number, pull_request: { ...payload.pull_request, number } }), res);
    assert.equal(res.code, number === 3 ? 503 : 202);
  }
  await tick(); release(); await tick();
  assert.equal(logs.length, 2);
  assert.ok(!JSON.stringify(logs).includes('private-provider-secret'));
  const res = response(); handler(delivery(), res); assert.equal(res.code, 202); await tick(); await tick();
});

test('actual app verifies raw JSON before parsing and keeps health/manual routes available', async () => {
  const { default: app } = await import('../src/app.js');
  const server = app.listen(0, '127.0.0.1');
  await new Promise(resolve => server.once('listening', resolve));
  const origin = `http://127.0.0.1:${server.address().port}`;
  try {
    const req = delivery({}, 'ping');
    const res = await fetch(origin + '/api/webhooks/github', { method: 'POST', headers: { ...req.headers, 'content-type': 'application/json' }, body: req.body });
    assert.equal(res.status, 200);
    const bad = await fetch(origin + '/api/webhooks/github', { method: 'POST', headers: { 'content-type': 'application/json' }, body: '{bad' });
    assert.equal(bad.status, 401);
    const oversized = await fetch(origin + '/api/webhooks/github', { method: 'POST', headers: { 'content-type': 'application/json' }, body: 'x'.repeat(1024 * 1024 + 1) });
    assert.equal(oversized.status, 413);
    assert.equal((await fetch(origin + '/api/health')).status, 200);
    assert.equal((await fetch(origin + '/api/analyses', { method: 'POST', headers: { 'content-type': 'application/json' }, body: '{}' })).status, 400);
  } finally { await new Promise(resolve => server.close(resolve)); }
});

test('signed HTTP PR runs the real shared pipeline with mocked GitHub and saves diff/provenance for the report API', async () => {
  const { default: app } = await import('../src/app.js');
  const server = app.listen(0, '127.0.0.1');
  await new Promise(resolve => server.once('listening', resolve));
  const origin = `http://127.0.0.1:${server.address().port}`;
  const realFetch = globalThis.fetch;
  const originalKey = process.env.GEMINI_API_KEY;
  delete process.env.GEMINI_API_KEY;
  let githubCalls = 0;
  mock.method(globalThis, 'fetch', async (url, options) => {
    if (String(url).startsWith(origin)) return realFetch(url, options);
    assert.ok(String(url).startsWith('https://api.github.com/'), 'No live external calls allowed');
    githubCalls++;
    return Response.json(String(url).includes('/files?')
      ? [{ filename: 'src/a.js', status: 'modified', additions: 1, deletions: 1, patch: '@@ -1 +1 @@\n-old();\n+next();' }]
      : { title: 'Webhook fixture', html_url: 'https://github.com/audit/repo/pull/22', changed_files: 1, base: payload.pull_request.base, head: payload.pull_request.head });
  });
  try {
    const req = delivery({ ...payload, number: 22, pull_request: { ...payload.pull_request, number: 22 } });
    const accepted = await fetch(origin + '/api/webhooks/github', { method: 'POST', headers: { ...req.headers, 'content-type': 'application/json' }, body: req.body });
    assert.equal(accepted.status, 202);
    const { analysisId } = await accepted.json();
    let report;
    for (let attempt = 0; attempt < 20 && !report; attempt++) { await tick(); report = await findAnalysis(analysisId); }
    assert.ok(report, 'Background pipeline must save the report');
    assert.equal(report.status, 'completed');
    assert.equal(report.aiStatus, 'skipped');
    assert.equal(report.trigger.repository, 'audit/repo');
    assert.equal(report.pullRequest.changedFiles[0].patch, '@@ -1 +1 @@\n-old();\n+next();');
    const detail = await fetch(origin + '/api/analyses/' + analysisId);
    assert.equal(detail.status, 200);
    assert.equal((await detail.json()).id, analysisId);
    const count = githubCalls;
    await fetch(origin + '/api/webhooks/github', { method: 'POST', headers: { ...req.headers, 'content-type': 'application/json' }, body: req.body });
    await tick(); await tick();
    assert.equal(githubCalls, count, 'Redelivery must not refetch or regenerate');
  } finally {
    if (originalKey === undefined) delete process.env.GEMINI_API_KEY; else process.env.GEMINI_API_KEY = originalKey;
    await new Promise(resolve => server.close(resolve));
  }
});
