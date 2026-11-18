import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { getReviewEngine, prepareAgentRequest, runAgentAnalysis } from '../src/features/ai/ai.agent.js';

const fixture = JSON.parse(await readFile(new URL('../../docs/contracts/prism-agent-v1/request.json', import.meta.url)));
const pr = { url: 'https://github.com/example/prism-demo/pull/7', repository: fixture.scope.repository, number: 7,
  baseSha: fixture.scope.baseSha, headSha: fixture.scope.headSha, title: 'Policy', filesComplete: true,
  changedFiles: [{ path: 'src/policy.js', additions: 1, deletions: 0, patch: '@@ -6,0 +7,1 @@\n+return !isDraft || !reviewsPaused;\n' }],
  reviewContext: { snippets: fixture.sources.map(({ sourceId, revision, ...source }) => source), omitted: [] } };
const options = { id: fixture.reviewId, installationId: 1, endpoint: 'http://127.0.0.1:8090', token: 'unit-test-private-service-token-only' };
const result = body => ({ schemaVersion: body.schemaVersion, reviewId: body.reviewId, scope: body.scope,
  status: 'completed', findings: [], review: { summary: 'Policy changed.', walkthrough: [{ filePath: 'src/policy.js',
    description: 'Eligibility condition changed.', evidenceRefs: [{ filePath: 'src/policy.js', lineSide: 'new', lineNumber: 7, evidence: 'return !isDraft || !reviewsPaused;' }] }], impacts: [], limitations: [] }, errorCode: null,
  diagnostics: { provider: 'gemini', model: 'scripted', provenance: 'scripted-fixture', events: [], stopReason: 'sufficient_evidence',
    toolCalls: 0, rounds: 1, attempts: 2, requests: [{ stage: 'decide', status: 'completed', durationMs: 2, usage: null }, { stage: 'draft', status: 'completed', durationMs: 2, usage: null }],
    usage: { inputTokens: null, outputTokens: null, thinkingTokens: null, totalTokens: null }, durationMs: 4 } });

test('agent private boundary prepares only bounded authorized snapshot and revalidates response', async () => {
  let calls = 0;
  const reviewed = await runAgentAnalysis({ ...pr, token: 'must-not-forward', description: 'password="do-not-forward"' }, { ...options,
    request: async (url, init) => {
      calls++; assert.equal(url, options.endpoint + '/v1/reviews'); assert.equal(init.redirect, 'error');
      assert.equal(init.headers.Authorization, 'Bearer ' + options.token);
      assert.ok(!init.body.includes('must-not-forward')); assert.ok(!init.body.includes('do-not-forward'));
      const body = JSON.parse(init.body); assert.equal(body.sources[0].revision, pr.headSha);
      assert.deepEqual(body.sources[0].relatedTo, ['src/policy.js']);
      return Response.json(result(body));
    } });
  assert.equal(calls, 1); assert.equal(reviewed.status, 'completed'); assert.ok(reviewed.review);
  assert.equal(reviewed.diagnostics.agent.provenance, 'scripted-fixture');
});

test('endpoint, scope and unsupported engine configuration fail closed before POST', async () => {
  for (const endpoint of ['https://example.com', 'http://127.0.0.1:8090/?token=oops', 'http://user:pass@localhost:8090', 'file:///secret']) {
    const reviewed = await runAgentAnalysis(pr, { ...options, endpoint, request: () => assert.fail('No request') });
    assert.equal(reviewed.status, 'unavailable');
  }
  assert.throws(() => getReviewEngine('typo'));
  assert.equal(getReviewEngine('legacy'), 'legacy');
  assert.equal(getReviewEngine('python-agent'), 'python-agent');
  assert.throws(() => prepareAgentRequest(pr, { ...options, installationId: undefined }));
});

test('production rejects plaintext transport before disclosing source or bearer', async () => {
  const previous = process.env.NODE_ENV; process.env.NODE_ENV = 'production';
  try {
    const reviewed = await runAgentAnalysis(pr, { ...options, endpoint: 'http://prism-agent.internal.demo.eastasia.azurecontainerapps.io', request: () => assert.fail('No plaintext POST') });
    assert.equal(reviewed.status, 'unavailable');
  } finally { if (previous === undefined) delete process.env.NODE_ENV; else process.env.NODE_ENV = previous; }
});

test('lost response and explicit uncertain result issue only one POST and never fall back', async () => {
  for (const response of [() => { throw Error('private lost response'); }, () => Response.json({ errorCode: 'MODEL_REQUEST_UNCERTAIN' }, { status: 504 })]) {
    let calls = 0;
    await assert.rejects(runAgentAnalysis(pr, { ...options, request: async () => { calls++; return response(); } }), { code: 'INTERRUPTED_MODEL_REQUEST' });
    assert.equal(calls, 1);
  }
});

test('foreign revision, invented finding and unselected source references cannot become success', async () => {
  for (const corrupt of [data => { data.scope.headSha = '3'.repeat(40); },
    data => { data.findings = [{ title: 'Wrong', severity: 'high', filePath: 'src/policy.js', lineNumber: 999, evidence: 'invented', explanation: 'Bad', suggestedFix: 'Fix' }]; },
    data => { data.review.walkthrough[0].evidenceRefs[0] = { filePath: 'test/policy.test.js', lineSide: 'new', lineNumber: 1, evidence: '// Draft PRs must not run.' }; }]) {
    const reviewed = await runAgentAnalysis(pr, { ...options, request: async (_, init) => { const data = result(JSON.parse(init.body)); corrupt(data); return Response.json(data); } });
    assert.notEqual(reviewed.status, 'completed');
  }
});

test('no-match activity is valid and metadata cannot smuggle private fields', async () => {
  const reviewed = await runAgentAnalysis(pr, { ...options, request: async (_, init) => {
    const data = result(JSON.parse(init.body));
    data.diagnostics.events = [{ tool: 'find_related_tests', status: 'no_match', sources: [], durationMs: 0 }];
    data.diagnostics.toolCalls = 1;
    return Response.json(data);
  } });
  assert.equal(reviewed.status, 'completed');
});

test('agent report preserves the Python prompt revision and requested review effort', async () => {
  const reviewed = await runAgentAnalysis(pr, { ...options, request: async (_, init) => {
    const data = result(JSON.parse(init.body));
    Object.assign(data.diagnostics, { promptVersion: 'bounded-review-v3', thinkingLevel: 'high' });
    data.diagnostics.requests[0].finishReason = 'STOP';
    return Response.json(data);
  } });
  assert.equal(reviewed.status, 'completed');
  assert.equal(reviewed.diagnostics.promptVersion, 'bounded-review-v3');
  assert.equal(reviewed.diagnostics.agent.thinkingLevel, 'high');
  assert.equal(reviewed.diagnostics.agent.requests[0].finishReason, 'STOP');
});

test('queued engine stays pinned and uncertain jobs require their lease owner', async () => {
  const { enqueueReviewJob, claimReviewJob, findReviewJob, markReviewJobUnknown } = await import('../src/features/analysis/analysis.repository.js');
  const id = 'agent-engine-pinned';
  await enqueueReviewJob({ id, payload: { options: { reviewEngine: 'python-agent' } } });
  await enqueueReviewJob({ id, payload: { options: { reviewEngine: 'legacy', trigger: { type: 'manual' } } } });
  assert.equal((await findReviewJob(id)).payload.options.reviewEngine, 'python-agent');
  await claimReviewJob(id, 'owner');
  await markReviewJobUnknown(id, 'other', 'INTERRUPTED_MODEL_REQUEST');
  assert.equal((await findReviewJob(id)).status, 'running');
  await markReviewJobUnknown(id, 'owner', 'INTERRUPTED_MODEL_REQUEST');
  assert.equal((await findReviewJob(id)).status, 'unknown');
});

test('worker retains unknown outcome instead of failed/completed after Python response loss', async () => {
  const { enqueueReviewJob, findReviewJob } = await import('../src/features/analysis/analysis.repository.js');
  const { processNextReview } = await import('../src/features/analysis/analysis.jobs.js');
  const id = 'webhook-' + 'e'.repeat(64);
  await enqueueReviewJob({ id, payload: { url: pr.url, options: { reviewEngine: 'python-agent' } } });
  let calls = 0;
  const queue = { receiveMessages: async () => ({ receivedMessageItems: [{ messageId: 'm', popReceipt: 'r', messageText: Buffer.from(id).toString('base64') }] }), deleteMessage: async () => {} };
  await processNextReview({ queue, analyze: async (_, settings) => { calls++; assert.equal(settings.reviewEngine, 'python-agent'); return { status: 500, body: { errorCode: 'INTERRUPTED_MODEL_REQUEST' } }; } });
  assert.equal((await findReviewJob(id)).status, 'unknown'); assert.equal(calls, 1);
});
