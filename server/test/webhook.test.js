import assert from 'node:assert/strict';
import { createHmac } from 'node:crypto';
import { afterEach, beforeEach, mock, test } from 'node:test';
import { createWebhookHandler } from '../src/features/pullRequest/pullRequest.webhook.js';
import { findAnalysis } from '../src/features/analysis/analysis.repository.js';

test('PR commands are exact and exclude bot, edited, non-PR and unrecognized comments', async () => {
  const { parseReviewCommand } = await import('../src/features/pullRequest/review.controls.js');
  const event = { action: 'created', issue: { pull_request: {}, number: 2 }, comment: { id: 9, body: '@prism-ai full review', user: { type: 'User', login: 'owner' } } };
  assert.equal(parseReviewCommand(event), 'full review');
  for (const variant of [{ ...event, action: 'edited' }, { ...event, issue: {} }, { ...event, comment: { ...event.comment, body: '@prism-ai review then run bash' } }, { ...event, comment: { ...event.comment, user: { type: 'Bot' } } }]) assert.equal(parseReviewCommand(variant), null);
});

test('pause controls persist per PR and stale commands cannot undo a newer setting', async () => {
  const { getReviewControl, setReviewPaused } = await import('../src/features/pullRequest/review.controls.js');
  const scope = { installationId: 15, repository: 'owner/repo', number: 2 };
  await setReviewPaused(scope, true, 100);
  assert.equal((await getReviewControl(scope)).paused, true);
  await setReviewPaused(scope, false, 99);
  assert.equal((await getReviewControl(scope)).paused, true);
  assert.equal((await getReviewControl({ ...scope, installationId: 16 })).paused, false);
  await setReviewPaused(scope, false, 101);
  assert.equal((await getReviewControl(scope)).paused, false);
});

test('command execution verifies fresh write permission and creates a pinned deliberate review', async () => {
  const { handleReviewCommand } = await import('../src/features/pullRequest/review.controls.js');
  const old = process.env.GITHUB_REVIEW_COMMANDS; process.env.GITHUB_REVIEW_COMMANDS = 'true';
  const event = { action: 'created', installation: { id: 16 }, repository: { full_name: 'owner/repo' }, issue: { number: 2, pull_request: {} },
    comment: { id: 22, body: '@prism-ai review', user: { login: 'owner', type: 'User', id: 10 } } };
  let permission = 'read'; let prReads = 0;
  const request = async path => {
    if (path.includes('/permission')) return { permission };
    prReads++; return { number: 2, state: 'open', draft: false, base: { sha: 'a'.repeat(40) }, head: { sha: 'b'.repeat(40) } };
  };
  try {
    await assert.rejects(handleReviewCommand(event, { request, getToken: async () => 'bot' }), /permission/i);
    assert.equal(prReads, 0);
    permission = 'write';
    const result = await handleReviewCommand(event, { request, getToken: async () => 'bot' });
    assert.equal(result.command, 'review'); assert.equal(result.payload.pull_request.head.sha, 'b'.repeat(40));
  } finally { if (old === undefined) delete process.env.GITHUB_REVIEW_COMMANDS; else process.env.GITHUB_REVIEW_COMMANDS = old; }
});

test('signed command webhook reuses review dispatch and carries explicit command identity', async () => {
  let reviewed;
  const handler = createWebhookHandler({ command: async () => ({ command: 'full review', commentId: 77, actorId: '42', payload }), find: async () => null,
    analyze: async (_url, options) => { reviewed = options; return { status: 201, body: { status: 'completed' } }; }, log() {} });
  const res = response();
  await handler(delivery({ action: 'created' }, 'issue_comment'), res); await tick();
  assert.equal(res.code, 202);
  assert.equal(reviewed.trigger.command, 'full review'); assert.equal(reviewed.trigger.actorId, '42');
  assert.match(reviewed.id, /^webhook-[a-f\d]{64}$/);
});

test('paused automatic webhook skips work but an explicit command bypasses the pause once', async () => {
  const old = process.env.GITHUB_APP_ID; process.env.GITHUB_APP_ID = '7';
  let calls = 0; const logs = [];
  const options = { control: async () => ({ paused: true }), find: async () => null, analyze: async () => { calls++; return { status: 201, body: { status: 'completed' } }; }, log: entry => logs.push(entry) };
  try {
    const handler = createWebhookHandler(options);
    handler(delivery({ ...payload, installation: { id: 7 } }), response()); await tick();
    assert.equal(calls, 0); assert.equal(logs[0].status, 'paused');
    const manual = createWebhookHandler({ ...options, getToken: async () => 'bot', command: async () => ({ command: 'review', commentId: 79, actorId: '42', payload: { ...payload, installation: { id: 7 } } }) });
    await manual(delivery({}, 'issue_comment'), response()); await tick();
    assert.equal(calls, 1);
  } finally { if (old === undefined) delete process.env.GITHUB_APP_ID; else process.env.GITHUB_APP_ID = old; }
});

test('queued work rechecks pause before minting credentials or calling AI', async () => {
  const { setReviewPaused } = await import('../src/features/pullRequest/review.controls.js');
  const { enqueueReviewJob, findReviewJob } = await import('../src/features/analysis/analysis.repository.js');
  const { processNextReview } = await import('../src/features/analysis/analysis.jobs.js');
  const id = 'webhook-' + 'e'.repeat(64);
  await setReviewPaused({ installationId: 19, repository: 'owner/repo', number: 3 }, true, 123);
  await enqueueReviewJob({ id, payload: { url: 'https://github.com/owner/repo/pull/3', options: { installationId: 19, trigger: { repository: 'owner/repo' } } } });
  let removed = 0;
  const queue = { receiveMessages: async () => ({ receivedMessageItems: [{ messageId: 'x', popReceipt: 'y', messageText: Buffer.from(id).toString('base64') }] }), deleteMessage: async () => { removed++; } };
  const result = await processNextReview({ queue, analyze() { assert.fail('Paused job must not analyze'); } });
  assert.equal(result.status, 'skipped'); assert.equal((await findReviewJob(id)).errorCode, 'REVIEW_PAUSED'); assert.equal(removed, 1);
});

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

test('durable queue integration: real Mongo, Azurite duplicates and process restart recovery', { skip: process.env.INTEGRATION_TESTS !== 'true', timeout: 30000 }, async () => {
  const mongoose = (await import('mongoose')).default;
  const { randomUUID } = await import('node:crypto');
  const { execFile } = await import('node:child_process');
  const { promisify } = await import('node:util');
  const execute = promisify(execFile);
  const { QueueClient } = await import('@azure/storage-queue');
  const { enqueueWebhookReview, processNextReview } = await import('../src/features/analysis/analysis.jobs.js');
  const { saveAnalysis, findReviewJob } = await import('../src/features/analysis/analysis.repository.js');
  const { runReviewWorkflow } = await import('../src/features/analysis/analysis.workflow.js');
  const suffix = randomUUID().replaceAll('-', '');
  const uri = 'mongodb://127.0.0.1:27017/prism_integration_' + suffix;
  const queue = new QueueClient('UseDevelopmentStorage=true', 'prism-test-' + suffix);
  try {
    await mongoose.connect(uri, { serverSelectionTimeoutMS: 3000 });
    const { ReviewJob } = await import('../src/features/analysis/analysis.model.js');
    await ReviewJob.init();
    await queue.create();
    const id = 'webhook-' + '9'.repeat(64);
    const job = { id, payload: { url: 'https://github.com/owned/fixture/pull/1', options: {} } };
    await Promise.all([enqueueWebhookReview(job, queue), enqueueWebhookReview(job, queue)]);
    let calls = 0;
    const analyze = async () => { calls++; const report = { id, status: 'completed', createdAt: new Date().toISOString(), pullRequest: {}, findings: [] }; await saveAnalysis(report); return { body: report }; };
    await processNextReview({ queue, analyze });
    await processNextReview({ queue, analyze });
    assert.equal(calls, 1);
    assert.equal((await findReviewJob(id)).status, 'completed');

    const scope = { id: 'restart-fixture', repository: 'owned/fixture', baseSha: 'a', headSha: 'b' };
    await assert.rejects(runReviewWorkflow({ ...scope, prepare: async () => {}, review: async () => ({ status: 'completed', findings: [] }), save: async () => { throw Error('simulated disk failure'); } }), /simulated disk failure/);
    const script = `import mongoose from 'mongoose'; import {runReviewWorkflow} from ${JSON.stringify(new URL('../src/features/analysis/analysis.workflow.js', import.meta.url).href)};
      try { await mongoose.connect(process.env.MONGODB_URI); const fail=async()=>{throw Error('unexpected repeated work')};
      const result=await runReviewWorkflow({...${JSON.stringify(scope)},resume:true,prepare:fail,review:fail,save:async r=>({resumed:r.status})});
      if(result.resumed!=='completed')throw Error('resume failed'); process.stdout.write('resumed-once'); } finally {await mongoose.disconnect();}`;
    const child = await execute(process.execPath, ['--input-type=module', '-e', script], { cwd: new URL('..', import.meta.url), env: { ...process.env, MONGODB_URI: uri }, timeout: 10000 });
    assert.equal(child.stdout, 'resumed-once');
  } finally {
    await queue.deleteIfExists();
    // This database name is generated above; never clean up a configured user database.
    if (mongoose.connection.name === 'prism_integration_' + suffix) await mongoose.connection.dropDatabase();
    await mongoose.disconnect();
  }
});

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

test('operator resume never marks a failed saved analysis as completed', async () => {
  const { processNextReview } = await import('../src/features/analysis/analysis.jobs.js');
  const { enqueueReviewJob, claimReviewJob, finishReviewJob, saveAnalysis, findReviewJob } = await import('../src/features/analysis/analysis.repository.js');
  const id = 'webhook-' + '6'.repeat(64);
  await enqueueReviewJob({ id, payload: { url: 'https://github.com/audit/repo/pull/1', options: {} } });
  await claimReviewJob(id, 'first'); await finishReviewJob(id, 'first', 'failed');
  await saveAnalysis({ id, status: 'failed', createdAt: new Date().toISOString(), pullRequest: {}, findings: [] });
  const result = await processNextReview({ resumeId: id, analyze: async () => { assert.fail('A terminal failed report needs a fresh deliberate review'); } });
  assert.equal(result.status, 'failed');
  assert.equal((await findReviewJob(id)).status, 'failed');
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
