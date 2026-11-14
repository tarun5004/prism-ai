import assert from 'node:assert/strict';

test('workflow resumes a failed save without repeating retrieval or the model', async () => {
  const { MemorySaver } = await import('@langchain/langgraph');
  const { runReviewWorkflow } = await import('../src/features/analysis/analysis.workflow.js');
  const checkpointer = new MemorySaver();
  let prepared = 0; let calls = 0; let writes = 0;
  const options = { id: 'resume-safe', repository: 'owner/repo', baseSha: 'a', headSha: 'b', checkpointer,
    prepare: async () => { prepared++; }, review: async () => { calls++; return { status: 'completed', findings: [] }; },
    save: async result => { if (++writes === 1) throw Error('storage offline'); return { body: result }; }, load: async () => assert.fail('not already saved') };
  await assert.rejects(runReviewWorkflow(options), /storage offline/);
  const result = await runReviewWorkflow(options);
  assert.equal(result.body.status, 'completed');
  assert.equal(calls, 1);
  assert.equal(prepared, 1);
  assert.equal(writes, 2);
});

test('workflow blocks an ambiguous model replay and isolates installation threads', async () => {
  const { MemorySaver } = await import('@langchain/langgraph');
  const { runReviewWorkflow } = await import('../src/features/analysis/analysis.workflow.js');
  const checkpointer = new MemorySaver(); let calls = 0;
  const options = { id: 'resume-unknown', repository: 'owner/repo', baseSha: 'a', headSha: 'b', checkpointer,
    prepare: async () => {}, review: async () => { calls++; throw Error('crash after request'); }, save: async () => {}, load: async () => {} };
  await assert.rejects(runReviewWorkflow(options), /crash after request/);
  await assert.rejects(runReviewWorkflow(options), { code: 'INTERRUPTED_MODEL_REQUEST' });
  await assert.rejects(runReviewWorkflow({ ...options, installationId: 9 }), /crash after request/);
  await assert.rejects(runReviewWorkflow({ ...options, id: 'expired-checkpoint', resume: true }), { code: 'CHECKPOINT_UNAVAILABLE' });
  assert.equal(calls, 2, 'a separate installation has a separate checkpoint');
});

test('opt-in review email sends one safe link and duplicate calls never send twice', async () => {
  const { sendReviewEmail } = await import('../src/features/analysis/analysis.mail.js');
  const keys = ['EMAIL_ENABLED', 'EMAIL_FROM', 'APP_ORIGIN']; const previous = keys.map(key => process.env[key]);
  [process.env.EMAIL_ENABLED, process.env.EMAIL_FROM, process.env.APP_ORIGIN] = ['true', 'reviews@example.com', 'https://prism.example'];
  const report = { id: 'email-once', status: 'completed', aiStatus: 'unavailable', createdAt: new Date().toISOString(), pullRequest: { description: 'private-source' }, findings: [{ evidence: 'private-source' }] };
  await saveAnalysis(report);
  let sends = 0;
  const transport = { sendMail: async message => { sends++; assert.equal(message.to, 'verified@example.com'); assert.match(message.text, /AI review unavailable/); assert.ok(!JSON.stringify(message).includes('private-source')); } };
  try {
    await Promise.all([sendReviewEmail(report, '42', { transport, getRecipient: async () => 'verified@example.com' }), sendReviewEmail(report, '42', { transport, getRecipient: async () => 'verified@example.com' })]);
    assert.equal(sends, 1);
    assert.equal((await findAnalysis(report.id)).emailNotification.status, 'sent');
  } finally { keys.forEach((key, index) => { if (previous[index] === undefined) delete process.env[key]; else process.env[key] = previous[index]; }); }
});

test('email failure preserves saved report and missing opt-in never sends mail', async () => {
  const { sendReviewEmail } = await import('../src/features/analysis/analysis.mail.js');
  const previous = process.env.EMAIL_ENABLED; process.env.EMAIL_ENABLED = 'true';
  try {
    const report = { id: 'email-failure', status: 'completed', createdAt: new Date().toISOString(), pullRequest: {}, findings: [] };
    await saveAnalysis(report);
    const result = await sendReviewEmail(report, '42', { getRecipient: async () => { throw Error('private mail data'); } });
    assert.equal(result.status, 'unavailable');
    assert.equal((await findAnalysis(report.id)).status, 'completed');
    const skipped = { ...report, id: 'email-not-opted', emailNotification: undefined }; await saveAnalysis(skipped);
    assert.equal((await sendReviewEmail(skipped, '42', { getRecipient: async () => null, transport: { sendMail() { assert.fail('No opt-in'); } } })).status, 'skipped');
    assert.ok(!JSON.stringify(result).includes('private'));
  } finally { if (previous === undefined) delete process.env.EMAIL_ENABLED; else process.env.EMAIL_ENABLED = previous; }
});
import { afterEach, beforeEach, mock, test } from 'node:test';
import { createAnalysis, setFindingFeedback } from '../src/features/analysis/analysis.controller.js';
import { findAnalysis, listAnalyses, saveAnalysis, findPreviousAnalysis } from '../src/features/analysis/analysis.repository.js';
import Analysis from '../src/features/analysis/analysis.model.js';
import { analyzePullRequest } from '../src/features/analysis/analysis.service.js';

let originalKey;
let originalModel;
const file = { filename: 'src/math.service.js', status: 'modified', additions: 1, deletions: 1, changes: 2, patch: '@@ -1 +1 @@\n-return value * 2;\n+return value / 2;' };
const finding = { title: 'Unexpected division', severity: 'medium', filePath: file.filename, lineNumber: 1, explanation: 'The result now halves instead of doubles.', suggestedFix: 'Confirm the intended behavior before restoring multiplication.', evidence: 'return value / 2;' };
const review = { summary: 'The calculation now divides.', walkthrough: [{ filePath: file.filename, description: 'Replaces multiplication with division.', evidenceRefs: [{ filePath: file.filename, lineSide: 'new', lineNumber: 1, evidence: finding.evidence }] }], impacts: [], limitations: ['Callers were not analyzed.'] };

test('revision memory stays inside the same PR and installation and ignores the current revision', async () => {
  const pr = { key: 'memory/repo#1', headSha: 'b'.repeat(40), baseSha: 'a'.repeat(40) };
  const row = { id: 'previous-memory', installationId: 73, status: 'completed', createdAt: '2026-11-01', pullRequest: { ...pr, headSha: 'c'.repeat(40) }, findings: [] };
  await saveAnalysis(row);
  await saveAnalysis({ ...row, id: 'wrong-install-memory', installationId: 74, createdAt: '2026-11-02' });
  await saveAnalysis({ ...row, id: 'wrong-pr-memory', pullRequest: { ...row.pullRequest, key: 'memory/repo#2' }, createdAt: '2026-11-03' });
  await saveAnalysis({ ...row, id: 'same-head-memory', pullRequest: pr, createdAt: '2026-11-04' });
  assert.equal((await findPreviousAnalysis(pr, 73)).id, row.id);
  assert.equal(await findPreviousAnalysis(pr), null);
});

test('feedback is validated and saved separately without changing generated evidence', async () => {
  const report = { id: 'feedback-test', status: 'completed', createdAt: new Date().toISOString(), pullRequest: {}, findings: [finding] };
  await saveAnalysis(report);
  const response = { status(code) { this.code = code; return this; }, json(body) { this.body = body; return this; } };
  await setFindingFeedback({ params: { analysisId: report.id, findingIndex: '0' }, body: { verdict: 'useful', reason: 'Confirmed by code review' } }, response);
  assert.equal(response.body.feedback['0_local'].verdict, 'useful');
  assert.deepEqual(response.body.findings, [finding]);
  await setFindingFeedback({ params: { analysisId: report.id, findingIndex: '0' }, body: { verdict: 'wrong-value' } }, response);
  assert.equal(response.code, 400);
  await setFindingFeedback({ params: { analysisId: report.id, findingIndex: '9' }, body: { verdict: 'useful' } }, response);
  assert.equal(response.code, 404);
});

test('history scopes before limiting and cannot be displaced by other installations', async () => {
  for (let index = 0; index < 22; index++) await saveAnalysis({ id: 'scope-history-' + index, installationId: index === 0 ? 701 : 702, status: 'completed', createdAt: new Date(Date.now() + index).toISOString(), pullRequest: { repository: 'scope/repo' }, findings: [] });
  const reports = await listAnalyses({ repositories: [{ installationId: 701, repository: 'scope/repo' }] });
  assert.deepEqual(reports.map(report => report.id), ['scope-history-0']);
});

beforeEach(() => {
  originalKey = process.env.GEMINI_API_KEY;
  originalModel = process.env.GEMINI_MODEL;
  process.env.GEMINI_API_KEY = 'offline-test-key';
  process.env.GEMINI_MODEL = 'gemini-3.8-flash';
});
afterEach(() => {
  mock.restoreAll();
  if (originalKey === undefined) delete process.env.GEMINI_API_KEY;
  else process.env.GEMINI_API_KEY = originalKey;
  if (originalModel === undefined) delete process.env.GEMINI_MODEL;
  else process.env.GEMINI_MODEL = originalModel;
});

function mockRequests(aiFailure, sourceCode = finding.evidence) {
  mock.method(globalThis, 'fetch', async (url) => {
    if (String(url).startsWith('https://api.github.com/')) {
      if (String(url).includes('/contents/')) return Response.json({ encoding: 'base64', content: Buffer.from(sourceCode).toString('base64'), size: sourceCode.length });
      return Response.json(String(url).includes('/files?') ? [file] : { title: 'Fixture PR', html_url: 'https://github.com/audit/repo/pull/1', user: { login: 'audit' }, base: { sha: 'base' }, head: { sha: 'head' }, changed_files: 1 });
    }
    if (aiFailure) return Response.json({ error: { code: 503, message: 'private provider data', status: 'UNAVAILABLE' } }, { status: 503 });
    return Response.json({ candidates: [{ content: { role: 'model', parts: [{ text: JSON.stringify({ findings: [finding], review }) }] }, finishReason: 'STOP' }] });
  });
}

async function createReport() {
  let httpStatus;
  let report;
  await createAnalysis({ body: { pullRequestUrl: 'https://github.com/audit/repo/pull/1' } }, {
    status(value) { httpStatus = value; return this; },
    json(value) { report = value; return value; }
  });
  assert.equal(httpStatus, 201);
  return report;
}

test('webhook revision mismatch saves a failure before context or AI calls', async () => {
  const calls = [];
  mock.method(globalThis, 'fetch', async url => {
    calls.push(String(url));
    assert.ok(String(url).startsWith('https://api.github.com/'));
    assert.ok(!String(url).includes('/contents/'));
    return Response.json(String(url).includes('/files?') ? [file] : { base: { sha: 'base' }, head: { sha: 'head' }, changed_files: 1 });
  });
  const trigger = { type: 'github_webhook', deliveryId: 'offline', action: 'opened', repository: 'audit/repo', baseSha: 'old', headSha: 'old' };
  const result = await analyzePullRequest('https://github.com/audit/repo/pull/1', { id: 'webhook-stale-test', trigger, expectedRevision: trigger });
  assert.equal(result.status, 409);
  assert.equal(result.body.errorCode, 'REVISION_CHANGED');
  assert.equal((await findAnalysis('webhook-stale-test')).trigger.deliveryId, 'offline');
  assert.equal(new Analysis(result.body).toObject().trigger.headSha, 'old');
  assert.ok(calls.length > 0);
});

test('schema retains AI execution details and location fields', async () => {
  const value = new Analysis({ id: 'schema-test', status: 'completed', createdAt: new Date().toISOString(), pullRequest: {}, findings: [finding], aiStatus: 'partial', aiModel: 'gemini-3.8-flash', aiError: 'INVALID_FINDINGS', aiCoverage: { analyzedFiles: 1, rejectedFindings: 1 } });
  await value.validate();
  const saved = value.toObject();
  assert.equal(saved.aiStatus, 'partial');
  assert.equal(saved.aiModel, 'gemini-3.8-flash');
  assert.equal(saved.aiError, 'INVALID_FINDINGS');
  assert.equal(saved.aiCoverage.rejectedFindings, 1);
  assert.equal(saved.findings[0].lineNumber, 1);
});

test('schema retains diagnostic fields and drops unexpected raw error data', async () => {
  const value = new Analysis({ id: 'diagnostic-schema-test', status: 'completed', createdAt: new Date().toISOString(), pullRequest: {}, aiDiagnostics: { durationMs: 1500, timeoutMs: 60000, attempts: 1, httpStatus: 503, networkCode: 'ECONNRESET', failureCategory: 'network', rawError: 'private details' } });
  await value.validate();
  assert.deepEqual(value.toObject().aiDiagnostics, { durationMs: 1500, timeoutMs: 60000, attempts: 1, httpStatus: 503, networkCode: 'ECONNRESET', failureCategory: 'network' });
});

test('controller saves AI findings alongside deterministic findings', async () => {
  mockRequests(false);
  const report = await createReport();
  assert.equal(report.aiStatus, 'completed');
  assert.equal(report.aiModel, 'gemini-3.8-flash');
  assert.equal(report.aiReview.summary, review.summary);
  assert.equal(report.aiReview.recommendation, 'human_review');
  assert.equal(report.aiCoverage.contextSnippets, 1);
  assert.equal(report.pullRequest.reviewContext, undefined);
  assert.equal(report.aiCoverage.analyzedFiles, 1);
  assert.equal(report.aiDiagnostics.attempts, 1);
  assert.deepEqual(report.aiDiagnostics.pipeline.stages.map(stage => stage.name), ['github', 'retrieval', 'memory', 'model']);
  assert.ok(report.aiDiagnostics.pipeline.stages.every(stage => stage.durationMs >= 0));
  assert.ok(Number.isInteger(report.aiDiagnostics.durationMs));
  assert.ok(report.findings.some(finding => finding.source === 'rule'));
  assert.equal(report.findings.find(finding => finding.source === 'ai').evidence, 'return value / 2;');
  assert.deepEqual(await findAnalysis(report.id), report);
});

test('AI outage preserves rule findings and saves the safe failure state', async () => {
  mockRequests(true);
  const report = await createReport();
  assert.equal(report.status, 'completed');
  assert.equal(report.aiStatus, 'unavailable');
  assert.equal(report.aiError, 'API_ERROR');
  assert.ok(report.findings.length > 0);
  assert.ok(report.findings.every(finding => finding.source === 'rule'));
  assert.equal((await findAnalysis(report.id)).aiError, 'API_ERROR');
  assert.equal((await findAnalysis(report.id)).aiDiagnostics.httpStatus, 503);
  assert.equal(report.aiDiagnostics.failureCategory, 'provider');
  assert.ok(!JSON.stringify(report).includes('private provider data'));
});

test('report IDs remain unique after controller reload and cannot overwrite history', async () => {
  mockRequests(true);
  const first = await createReport();
  const { createAnalysis: reloadedController } = await import('../src/features/analysis/analysis.controller.js?restart-test');
  let second;
  await reloadedController({ body: { pullRequestUrl: 'https://github.com/audit/repo/pull/1' } }, {
    status() { return this; }, json(value) { second = value; return value; }
  });
  assert.notEqual(first.id, second.id);
  assert.match(first.id, /^[0-9a-f-]{36}$/);
  await assert.rejects(saveAnalysis({ ...first, findings: [] }), /already exists/);
  assert.deepEqual(await findAnalysis(first.id), first);
});

test('non-string input returns a JSON validation error without external requests', async () => {
  const request = mock.method(globalThis, 'fetch', () => { throw Error('must not fetch'); });
  let status;
  let result;
  await createAnalysis({ body: { pullRequestUrl: 123 } }, {
    status(value) { status = value; return this; }, json(value) { result = value; }
  });
  assert.equal(status, 400);
  assert.equal(typeof result.message, 'string');
  assert.equal(request.mock.callCount(), 0);
});

test('persists a safe actionable GitHub failure code without upstream details', async () => {
  mock.method(globalThis, 'fetch', async () => Response.json({ message: 'private upstream error' }, { status: 403, headers: { 'x-ratelimit-remaining': '0' } }));
  let report;
  await createAnalysis({ body: { pullRequestUrl: 'https://github.com/audit/repo/pull/1' } }, {
    status(value) { assert.equal(value, 502); return this; }, json(value) { report = value; }
  });
  assert.equal(report.errorCode, 'GITHUB_RATE_LIMIT');
  assert.equal((await findAnalysis(report.id)).errorCode, report.errorCode);
  assert.ok(!JSON.stringify(report).includes('private upstream error'));
});

test('raw secret-bearing source context never leaks through saved report APIs', async () => {
  mockRequests(false, 'const password = "private-source-value";\n' + finding.evidence);
  const report = await createReport();
  const saved = await findAnalysis(report.id);
  assert.ok(!JSON.stringify(report).includes('private-source-value'));
  assert.ok(!JSON.stringify(saved).includes('private-source-value'));
  assert.ok(report.aiCoverage.contextOmissions.some(item => item.reason === 'sensitive-content'));
});

function streamResponse(onFrame = () => {}) {
  const frames = [];
  return {
    frames, headers: {}, ended: false,
    status(value) { this.statusCode = value; return this; },
    setHeader(name, value) { this.headers[name] = value; },
    flushHeaders() {},
    write(value) { const frame = JSON.parse(value); frames.push(frame); onFrame(frame); },
    end() { this.ended = true; },
    json(value) { this.jsonValue = value; return value; }
  };
}

test('streams actual stage boundaries and one saved terminal report', async () => {
  mockRequests(false);
  const response = streamResponse(frame => {
    if (frame.type !== 'progress') return;
    const calls = globalThis.fetch.mock.callCount();
    if (frame.stage === 'fetching') assert.equal(calls, 0);
    if (frame.stage === 'context') assert.equal(calls, 3);
    if (frame.stage === 'reviewing') assert.equal(calls, 4);
    if (frame.stage === 'saving') assert.equal(calls, 5);
  });
  await createAnalysis({ headers: { accept: 'application/x-ndjson' }, body: { pullRequestUrl: 'https://github.com/audit/repo/pull/1' } }, response);
  assert.equal(response.headers['Content-Type'], 'application/x-ndjson; charset=utf-8');
  assert.deepEqual(response.frames.filter(frame => frame.type === 'progress').map(frame => frame.stage), ['fetching', 'context', 'reviewing', 'saving']);
  const terminal = response.frames.at(-1);
  assert.equal(terminal.type, 'result');
  assert.deepEqual(JSON.parse(JSON.stringify(await findAnalysis(terminal.report.id))), terminal.report);
  assert.equal(response.frames.filter(frame => frame.type === 'result').length, 1);
  assert.equal(response.ended, true);
});

test('streamed provider failure retains deterministic report and honest AI status', async () => {
  mockRequests(true);
  const response = streamResponse();
  await createAnalysis({ headers: { accept: 'application/x-ndjson' }, body: { pullRequestUrl: 'https://github.com/audit/repo/pull/1' } }, response);
  const terminal = response.frames.at(-1);
  assert.equal(terminal.type, 'result');
  assert.equal(terminal.report.aiStatus, 'unavailable');
  assert.ok(terminal.report.findings.some(finding => finding.source === 'rule'));
});

test('stream errors terminate safely without claiming subsequent stages', async () => {
  mock.method(globalThis, 'fetch', async () => Response.json({ message: 'private error' }, { status: 403 }));
  const response = streamResponse();
  await createAnalysis({ headers: { accept: 'application/x-ndjson' }, body: { pullRequestUrl: 'https://github.com/audit/repo/pull/1' } }, response);
  assert.deepEqual(response.frames.filter(frame => frame.type === 'progress').map(frame => frame.stage), ['fetching']);
  assert.equal(response.frames.at(-1).type, 'error');
  assert.equal(response.ended, true);
  assert.ok(!JSON.stringify(response.frames).includes('private error'));
});

test('a disconnected stream does not prevent saving its analysis', async () => {
  mockRequests(false);
  const before = new Set((await listAnalyses()).map(report => report.id));
  const response = streamResponse();
  response.destroyed = true;
  response.write = () => { throw Error('must not write after disconnect'); };
  response.json = () => { throw Error('must not write JSON after disconnect'); };
  await createAnalysis({ headers: { accept: 'application/x-ndjson' }, body: { pullRequestUrl: 'https://github.com/audit/repo/pull/1' } }, response);
  assert.equal(response.frames.length, 0);
  assert.ok((await listAnalyses()).some(report => !before.has(report.id) && report.aiReview));
});

test('does not announce AI stages when the provider is not configured', async () => {
  mockRequests(false);
  delete process.env.GEMINI_API_KEY;
  const response = streamResponse();
  await createAnalysis({ headers: { accept: 'application/x-ndjson' }, body: { pullRequestUrl: 'https://github.com/audit/repo/pull/1' } }, response);
  assert.deepEqual(response.frames.filter(frame => frame.type === 'progress').map(frame => frame.stage), ['fetching', 'saving']);
  assert.equal(response.frames.at(-1).report.aiError, 'MISSING_API_KEY');
});

test('does not announce AI review when no reviewable diff exists', async () => {
  mock.method(globalThis, 'fetch', async url => Response.json(String(url).includes('/files?') ? [] : { title: 'Empty PR', html_url: 'https://github.com/audit/repo/pull/1', changed_files: 0 }));
  const response = streamResponse();
  await createAnalysis({ headers: { accept: 'application/x-ndjson' }, body: { pullRequestUrl: 'https://github.com/audit/repo/pull/1' } }, response);
  assert.deepEqual(response.frames.filter(frame => frame.type === 'progress').map(frame => frame.stage), ['fetching', 'saving']);
  assert.equal(response.frames.at(-1).report.aiError, 'NO_REVIEWABLE_DIFF');
});
