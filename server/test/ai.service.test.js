import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { afterEach, beforeEach, mock, test } from 'node:test';
import * as aiService from '../src/features/ai/ai.service.js';
import * as contextService from '../src/features/ai/ai.context.js';

const expected = { status: 'ok', provider: 'gemini', message: 'Connection successful' };

test('lexical guidance ranks relevant sections with exact original coordinates', () => {
  const result = contextService.rankGuidance('# Setup\nInstall npm\n\n# Authorization\nOnly note owners can delete notes.\n\n# Styling\nUse spaces.', 'note authorization delete');
  assert.equal(result[0].startLine, 4);
  assert.match(result[0].code, /Only note owners/);
  assert.ok(result[0].score > 0);
  assert.deepEqual(contextService.rankGuidance('# Setup\nInstall npm', 'authorization'), []);
});

test('guidance retrieves a relevant paragraph beyond the first thirty lines', () => {
  const lines = ['# Rules', ...Array.from({ length: 65 }, () => 'General setup guidance.'), 'Only note owners can delete notes.'];
  const result = contextService.rankGuidance(lines.join('\n'), 'note owners delete');
  assert.ok(result.some(chunk => chunk.code.includes(lines[66])));
  for (const chunk of result) assert.equal(chunk.code, lines.slice(chunk.startLine - 1, chunk.startLine - 1 + chunk.code.split('\n').length).join('\n'));
});

test('records SDK usage and experiment identity even when response validation fails', async () => {
  globalThis.fetch.mock.mockImplementation(async () => Response.json({ candidates: [], usageMetadata: {
    promptTokenCount: 123, candidatesTokenCount: 42, thoughtsTokenCount: 8, totalTokenCount: 173
  } }));
  const result = await aiService.runAiAnalysis(reviewPr);
  assert.deepEqual(result.diagnostics.usage, { inputTokens: 123, outputTokens: 42, thinkingTokens: 8, totalTokens: 173 });
  assert.match(result.diagnostics.runId, /^[a-f\d-]{36}$/);
  assert.equal(result.diagnostics.promptVersion, 'pr-review-v2');
  assert.equal(result.diagnostics.schemaVersion, 'review-v1');
});

test('missing provider usage remains unknown instead of zero', async () => {
  respondWith('{}');
  const result = await aiService.runAiAnalysis(reviewPr);
  assert.equal(result.diagnostics.usage, null);
});

test('default review deadline is 120 seconds in SDK headers and diagnostics', async () => {
  respondWith(JSON.stringify({ findings: [] }));
  const result = await aiService.runAiAnalysis({ changedFiles: [{ path: 'a.js', additions: 1, deletions: 0, patch: '@@ -0,0 +1 @@\n+hello();' }] });
  assert.equal(result.diagnostics.timeoutMs, 120000);
  const options = globalThis.fetch.mock.calls[0].arguments[1];
  assert.equal(new Headers(options.headers).get('x-server-timeout'), '120');
  assert.equal(globalThis.fetch.mock.callCount(), 1);
});
const environmentKeys = ['GEMINI_API_KEY', 'GEMINI_MODEL', 'GEMINI_TIMEOUT_MS', 'AI_API_URL', 'AI_API_KEY', 'LANGFUSE_ENABLED', 'LANGFUSE_PUBLIC_KEY', 'LANGFUSE_SECRET_KEY', 'LANGFUSE_BASE_URL'];
let originalEnvironment;

beforeEach(() => {
  originalEnvironment = Object.fromEntries(environmentKeys.map((key) => [key, process.env[key]]));
  process.env.GEMINI_API_KEY = 'offline-test-key';
  delete process.env.GEMINI_MODEL;
  delete process.env.GEMINI_TIMEOUT_MS;
  delete process.env.AI_API_URL;
  delete process.env.AI_API_KEY;
  for (const key of environmentKeys.filter(key => key.startsWith('LANGFUSE_'))) delete process.env[key];
  // Offline tests must never fall through to a real provider request.
  mock.method(globalThis, 'fetch', async () => { throw new Error('Unexpected network request'); });
});

afterEach(() => {
  mock.restoreAll();
  for (const [key, value] of Object.entries(originalEnvironment)) {
    if (value === undefined) delete process.env[key];
    else process.env[key] = value;
  }
});

function respondWith(text) {
  globalThis.fetch.mock.mockImplementation(async () => Response.json({
    candidates: [{ content: { role: 'model', parts: [{ text }] }, finishReason: 'STOP' }],
    modelVersion: 'gemini-3.8-flash'
  }));
}

const contextualReview = {
  summary: 'The calculation changes multiplication to division.',
  walkthrough: [{ filePath: 'src/math.js', description: 'double now divides the input.', evidenceRefs: [{ filePath: 'src/math.js', lineSide: 'new', lineNumber: 2, evidence: '  return value / 2;' }] }],
  impacts: [{ description: 'Callers expecting double may receive half.', evidenceRefs: [{ filePath: 'src/math.js', lineSide: 'new', lineNumber: 2, evidence: '  return value / 2;' }] }],
  limitations: ['Callers were not supplied.']
};

test('optional Langfuse export sends linked OTLP spans without repository or reviewer content', async () => {
  assert.equal((await aiService.exportReviewTrace({})).status, 'disabled');
  process.env.LANGFUSE_ENABLED = 'true'; process.env.LANGFUSE_PUBLIC_KEY = 'test-public'; process.env.LANGFUSE_SECRET_KEY = 'test-secret';
  globalThis.fetch.mock.mockImplementation(async (url, options) => {
    assert.equal(url, 'https://cloud.langfuse.com/api/public/otel/v1/traces');
    assert.equal(options.headers['x-langfuse-ingestion-version'], '4');
    const spans = JSON.parse(options.body).resourceSpans[0].scopeSpans[0].spans;
    assert.equal(spans.length, 2);
    assert.equal(spans[1].parentSpanId, spans[0].spanId);
    assert.ok(spans.every(span => /^[a-f\d]{32}$/.test(span.traceId)));
    assert.ok(!options.body.includes('private-code'));
    return Response.json({});
  });
  const result = await aiService.exportReviewTrace({ aiStatus: 'completed', aiModel: 'gemini-test', pullRequest: { description: 'private-code' }, findings: [{ explanation: 'private-code' }], aiDiagnostics: { promptVersion: 'pr-review-v2', usage: { inputTokens: 12, outputTokens: 4 }, pipeline: { startedAt: new Date().toISOString(), stages: [{ name: 'model', startedAt: new Date().toISOString(), durationMs: 12, status: 'completed' }] } } });
  assert.equal(result.status, 'exported');
});

test('trace export failures return a safe status without throwing away analysis', async () => {
  process.env.LANGFUSE_ENABLED = 'true'; process.env.LANGFUSE_PUBLIC_KEY = 'test-public'; process.env.LANGFUSE_SECRET_KEY = 'test-secret';
  globalThis.fetch.mock.mockImplementation(async () => { throw new Error('private-sdk-error'); });
  const result = await aiService.exportReviewTrace({ aiDiagnostics: { pipeline: { startedAt: new Date().toISOString(), stages: [] } } });
  assert.equal(result.status, 'unavailable');
  assert.ok(!JSON.stringify(result).includes('private-sdk-error'));
});

test('returns a grounded summary, walkthrough, impacts and advisory recommendation', async () => {
  respondWith(JSON.stringify({ findings: [validFinding], review: contextualReview }));
  const result = await aiService.runAiAnalysis({ ...reviewPr, description: 'Keep double behavior' });
  assert.equal(result.review.summary, contextualReview.summary);
  assert.equal(result.review.recommendation, 'human_review');
  const sent = JSON.parse(JSON.parse(globalThis.fetch.mock.calls[0].arguments[1].body).contents[0].parts[0].text);
  assert.equal(sent.intent.description, 'Keep double behavior');
  assert.ok(Array.isArray(sent.snippets));
});

test('memory reaches the model as bounded historical labels without raw annotations', async () => {
  respondWith(JSON.stringify({ findings: [validFinding], review: contextualReview }));
  const result = await aiService.runAiAnalysis({ ...reviewPr, reviewMemory: { analysisId: 'old-review', headSha: 'a'.repeat(40), findings: [{ title: 'Check multiplication', filePath: 'src/math.js', reason: 'private reviewer text' }] } });
  const sent = JSON.parse(JSON.parse(globalThis.fetch.mock.calls[0].arguments[1].body).contents[0].parts[0].text);
  assert.equal(sent.memory.findings[0].title, 'Check multiplication');
  assert.ok(!JSON.stringify(sent).includes('private reviewer text'));
  assert.equal(result.coverage.memorySource.analysisId, 'old-review');
});

test('rejects invented impact references while preserving valid findings', async () => {
  respondWith(JSON.stringify({ findings: [validFinding], review: { ...contextualReview, impacts: [{ description: 'Invented', evidenceRefs: [{ filePath: 'unknown.js', lineSide: 'new', lineNumber: 1, evidence: 'made up' }] }] } }));
  const result = await aiService.runAiAnalysis(reviewPr);
  assert.equal(result.error, 'INVALID_REVIEW');
  assert.equal(result.status, 'partial');
  assert.equal(result.review, undefined);
  assert.equal(result.findings.length, 1);
});

test('validates a removed-line finding on its actual old-side evidence', async () => {
  const finding = { ...validFinding, filePath: 'src/math.js', lineSide: 'old', lineNumber: 10, evidence: 'if (!user) throw Error();' };
  respondWith(JSON.stringify({ findings: [finding] }));
  const result = await aiService.runAiAnalysis({ changedFiles: [{ path: 'src/math.js', additions: 0, deletions: 1, patch: '@@ -10 +9,0 @@\n-if (!user) throw Error();' }] });
  assert.equal(result.findings[0].lineSide, 'old');
  assert.equal(result.findings[0].lineNumber, 10);
});

test('Gemini connectivity is available separately from PR analysis', () => {
  assert.equal(typeof aiService.checkGeminiConnection, 'function');
});

test('validates structured output through the real SDK with the selected model', async () => {
  let request;
  globalThis.fetch.mock.mockImplementation(async (url, options) => {
    request = { url: String(url), body: JSON.parse(options.body) };
    return Response.json({ candidates: [{ content: { role: 'model', parts: [{ text: JSON.stringify(expected) }] }, finishReason: 'STOP' }] });
  });
  assert.deepEqual(await aiService.checkGeminiConnection(), expected);
  assert.match(request.url, /models\/gemini-3\.8-flash:generateContent/);
  assert.equal(request.body.generationConfig.responseMimeType, 'application/json');
  assert.deepEqual(request.body.generationConfig.responseJsonSchema.required, ['status', 'provider', 'message']);
});

test('honors GEMINI_MODEL configuration', async () => {
  process.env.GEMINI_MODEL = 'configured-model';
  respondWith(JSON.stringify(expected));
  assert.deepEqual(await aiService.checkGeminiConnection(), expected);
  assert.match(String(globalThis.fetch.mock.calls[0].arguments[0]), /models\/configured-model:generateContent/);
});

test('rejects a missing or blank key without a request', async () => {
  for (const value of [undefined, '   ']) {
    if (value === undefined) delete process.env.GEMINI_API_KEY;
    else process.env.GEMINI_API_KEY = value;
    const result = await aiService.checkGeminiConnection();
    assert.equal(result.status, 'unavailable');
    assert.equal(result.code, 'MISSING_API_KEY');
  }
  assert.equal(globalThis.fetch.mock.callCount(), 0);
});

for (const [name, text] of [
  ['malformed JSON', '{broken'],
  ['empty response', ''],
  ['missing required fields', '{"status":"ok"}'],
  ['wrong status', '{"status":"failed","provider":"gemini","message":"Connection successful"}'],
  ['wrong provider', '{"status":"ok","provider":"other","message":"Connection successful"}'],
  ['wrong message type', '{"status":"ok","provider":"gemini","message":{}}'],
  ['unexpected message', '{"status":"ok","provider":"gemini","message":"Something else"}'],
  ['extra fields', '{"status":"ok","provider":"gemini","message":"Connection successful","secret":"unexpected"}'],
  ['null output', 'null'],
  ['array output', '[]']
]) {
  test(`rejects ${name} safely`, async () => {
    respondWith(text);
    const result = await aiService.checkGeminiConnection();
    assert.equal(result.status, 'unavailable');
    assert.equal(result.code, 'INVALID_RESPONSE');
    assert.equal(result.message, 'Gemini returned an invalid connectivity response.');
  });
}

test('sanitizes provider failure and does not retry a 503', async () => {
  globalThis.fetch.mock.mockImplementation(async () => Response.json({ error: { code: 503, message: 'private provider details offline-test-key', status: 'UNAVAILABLE' } }, { status: 503 }));
  const result = await aiService.checkGeminiConnection();
  assert.equal(result.status, 'unavailable');
  assert.equal(result.code, 'API_ERROR');
  assert.equal(globalThis.fetch.mock.callCount(), 1);
  assert.equal(JSON.stringify(result).includes('offline-test-key'), false);
  assert.equal(JSON.stringify(result).includes('private provider details'), false);
});

test('handles transport failures without exposing their message', async () => {
  globalThis.fetch.mock.mockImplementation(async () => { throw new Error('sensitive transport details'); });
  const result = await aiService.checkGeminiConnection();
  assert.equal(result.code, 'API_ERROR');
  assert.equal(JSON.stringify(result).includes('sensitive'), false);
});

test('aborts a stalled request and reports a timeout', async () => {
  globalThis.fetch.mock.mockImplementation(async (_url, { signal }) => new Promise((_resolve, reject) => {
    signal.addEventListener('abort', () => reject(signal.reason), { once: true });
  }));
  // A mocked fetch has no socket keeping Node alive for the unref'd abort timer.
  const keepAlive = setTimeout(() => {}, 1000);
  try {
    const result = await aiService.checkGeminiConnection({ timeoutMs: 25 });
    assert.equal(result.status, 'unavailable');
    assert.equal(result.code, 'TIMEOUT');
    assert.equal(globalThis.fetch.mock.callCount(), 1);
  } finally {
    clearTimeout(keepAlive);
  }
});

test('an empty PR does not trigger a Gemini review', async () => {
  const result = await aiService.runAiAnalysis({ changedFiles: [] });
  assert.equal(result.status, 'skipped');
  assert.equal(globalThis.fetch.mock.callCount(), 0);
});

const reviewPr = { title: 'Do not send metadata', changedFiles: [{ path: 'src/math.js', additions: 1, deletions: 1, patch: '@@ -1,2 +1,2 @@\n function double(value) {\n-  return value * 2;\n+  return value / 2;' }] };
const validFinding = { title: 'Double now halves the input', severity: 'medium', filePath: 'src/math.js', lineNumber: 2, explanation: 'The changed expression divides instead of multiplying.', suggestedFix: 'Return value * 2 after confirming the intended behavior.', evidence: '  return value / 2;' };

test('reviews bounded diff through Gemini and preserves report compatibility', async () => {
  let request;
  globalThis.fetch.mock.mockImplementation(async (url, options) => {
    request = { url: String(url), body: JSON.parse(options.body) };
    return Response.json({ candidates: [{ content: { role: 'model', parts: [{ text: JSON.stringify({ findings: [validFinding], review: contextualReview }) }] }, finishReason: 'STOP' }] });
  });
  const result = await aiService.runAiAnalysis(reviewPr);
  assert.equal(result.status, 'completed');
  assert.deepEqual(result.findings[0], { ...validFinding, category: 'ai-review', confidence: 'low', affectedFiles: ['src/math.js'], recommendedAction: validFinding.suggestedFix, source: 'ai' });
  assert.match(request.url, /models\/gemini-3\.8-flash:generateContent/);
  assert.equal(request.body.generationConfig.responseMimeType, 'application/json');
  assert.ok(request.body.contents[0].parts[0].text.includes('Do not send metadata'));
  assert.equal(globalThis.fetch.mock.callCount(), 1);
});

for (const [name, changes] of [
  ['unknown path', { filePath: 'not-sent.js' }],
  ['context-only line', { lineNumber: 1, evidence: 'function double(value) {' }],
  ['outside line', { lineNumber: 900 }],
  ['string line number', { lineNumber: '2' }],
  ['fractional line number', { lineNumber: 2.5 }],
  ['invalid severity', { severity: 'critical' }],
  ['fabricated evidence', { evidence: 'return dangerous();' }],
  ['substring evidence', { evidence: 'value' }],
  ['missing evidence', { evidence: undefined }],
  ['incorrect title type', { title: {} }],
  ['empty explanation', { explanation: ' ' }],
  ['missing fix', { suggestedFix: undefined }]
]) {
  test(`rejects AI finding with ${name}`, async () => {
    respondWith(JSON.stringify({ findings: [{ ...validFinding, ...changes }] }));
    const result = await aiService.runAiAnalysis(reviewPr);
    assert.equal(result.status, 'unavailable');
    assert.deepEqual(result.findings, []);
    assert.equal(result.error, 'INVALID_FINDINGS');
    assert.equal(result.coverage.rejectedFindings, 1);
  });
}

test('keeps valid findings while exposing rejected model output', async () => {
  respondWith(JSON.stringify({ findings: [validFinding, { ...validFinding, filePath: 'invented.js' }, null] }));
  const result = await aiService.runAiAnalysis(reviewPr);
  assert.equal(result.status, 'partial');
  assert.equal(result.findings.length, 1);
  assert.equal(result.coverage.rejectedFindings, 2);
});

test('empty findings are valid but malformed root output is not', async () => {
  respondWith(JSON.stringify({ findings: [], review: contextualReview }));
  assert.equal((await aiService.runAiAnalysis(reviewPr)).status, 'completed');
  for (const text of ['{}', 'null', '{broken', '{"findings":{}}']) {
    respondWith(text);
    const result = await aiService.runAiAnalysis(reviewPr);
    assert.equal(result.status, 'unavailable');
    assert.equal(result.error, 'INVALID_RESPONSE');
  }
});

test('reports limited coverage even when the model returns no findings', async () => {
  respondWith(JSON.stringify({ findings: [], review: contextualReview }));
  const result = await aiService.runAiAnalysis({ changedFiles: [...reviewPr.changedFiles, { path: 'other.js', patch: '' }] });
  assert.equal(result.status, 'partial');
  assert.equal(result.coverage.skippedFiles.length, 1);
});

test('missing key skips PR AI without making a request', async () => {
  delete process.env.GEMINI_API_KEY;
  const result = await aiService.runAiAnalysis(reviewPr);
  assert.equal(result.status, 'skipped');
  assert.equal(result.error, 'MISSING_API_KEY');
  assert.equal(globalThis.fetch.mock.callCount(), 0);
});

test('PR provider failure is sanitized and never retried', async () => {
  globalThis.fetch.mock.mockImplementation(async () => Response.json({ error: { code: 503, message: 'private offline-test-key', status: 'UNAVAILABLE' } }, { status: 503 }));
  const result = await aiService.runAiAnalysis(reviewPr);
  assert.equal(result.status, 'unavailable');
  assert.equal(result.error, 'API_ERROR');
  assert.equal(globalThis.fetch.mock.callCount(), 1);
  assert.ok(!JSON.stringify(result).includes('private offline-test-key'));
  assert.equal(result.diagnostics.httpStatus, 503);
  assert.equal(result.diagnostics.failureCategory, 'provider');
  assert.equal(result.diagnostics.attempts, 1);
});

test('PR request timeout returns an honest AI failure', async () => {
  globalThis.fetch.mock.mockImplementation(async (_url, { signal }) => new Promise((_resolve, reject) => signal.addEventListener('abort', () => reject(signal.reason), { once: true })));
  const keepAlive = setTimeout(() => {}, 1000);
  try {
    const result = await aiService.runAiAnalysis(reviewPr, { timeoutMs: 25 });
    assert.equal(result.error, 'TIMEOUT');
    assert.equal(result.diagnostics.failureCategory, 'timeout');
    assert.equal(result.diagnostics.timeoutMs, 25);
    assert.ok(result.diagnostics.durationMs >= 0);
  }
  finally { clearTimeout(keepAlive); }
});

test('PR timeout defaults to 120 seconds and records safe duration', async () => {
  respondWith(JSON.stringify({ findings: [], review: contextualReview }));
  const result = await aiService.runAiAnalysis(reviewPr);
  assert.equal(result.diagnostics.timeoutMs, 120000);
  assert.equal(result.diagnostics.attempts, 1);
  assert.ok(Number.isInteger(result.diagnostics.durationMs));
  assert.ok(result.diagnostics.durationMs >= 0);
  assert.equal(result.diagnostics.failureCategory, undefined);
});

test('PR timeout can be configured through the environment', async () => {
  process.env.GEMINI_TIMEOUT_MS = '90000';
  respondWith('{"findings":[]}');
  assert.equal((await aiService.runAiAnalysis(reviewPr)).diagnostics.timeoutMs, 90000);
});

test('configured PR timeout actually aborts a stalled request', async () => {
  process.env.GEMINI_TIMEOUT_MS = '25';
  globalThis.fetch.mock.mockImplementation(async (_url, { signal }) => new Promise((_resolve, reject) => signal.addEventListener('abort', () => reject(signal.reason), { once: true })));
  const keepAlive = setTimeout(() => {}, 1000);
  try {
    const result = await aiService.runAiAnalysis(reviewPr);
    assert.equal(result.error, 'TIMEOUT');
    assert.equal(result.diagnostics.timeoutMs, 25);
    assert.equal(globalThis.fetch.mock.callCount(), 1);
  } finally { clearTimeout(keepAlive); }
});

test('invalid timeout settings fail safely without a provider request', async () => {
  for (const value of ['invalid', '0', '120001', '1.5']) {
    process.env.GEMINI_TIMEOUT_MS = value;
    const result = await aiService.runAiAnalysis(reviewPr);
    assert.equal(result.error, 'INVALID_TIMEOUT');
    assert.equal(result.diagnostics.attempts, 0);
    assert.equal(result.diagnostics.timeoutMs, undefined);
    assert.equal(result.diagnostics.failureCategory, 'configuration');
  }
  assert.equal(globalThis.fetch.mock.callCount(), 0);
});

test('network diagnostics retain only a known code from the error cause', async () => {
  globalThis.fetch.mock.mockImplementation(async () => { throw new TypeError('private offline-test-key', { cause: Object.assign(new Error('sensitive details'), { code: 'ECONNRESET' }) }); });
  const result = await aiService.runAiAnalysis(reviewPr);
  assert.equal(result.error, 'API_ERROR');
  assert.equal(result.diagnostics.networkCode, 'ECONNRESET');
  assert.equal(result.diagnostics.failureCategory, 'network');
  assert.ok(!JSON.stringify(result).includes('offline-test-key'));
  assert.ok(!JSON.stringify(result).includes('sensitive details'));
});

test('network diagnostics recognize aggregated connection errors', async () => {
  globalThis.fetch.mock.mockImplementation(async () => { throw new TypeError('fetch failed', { cause: new AggregateError([Object.assign(new Error(), { code: 'ENOTFOUND' })]) }); });
  assert.equal((await aiService.runAiAnalysis(reviewPr)).diagnostics.networkCode, 'ENOTFOUND');
});

test('unknown error codes and raw error content are not persisted', async () => {
  globalThis.fetch.mock.mockImplementation(async () => { throw Object.assign(new Error('private details'), { code: 'offline-test-key', status: '503' }); });
  const result = await aiService.runAiAnalysis(reviewPr);
  assert.equal(result.diagnostics.networkCode, undefined);
  assert.equal(result.diagnostics.httpStatus, undefined);
  assert.equal(result.diagnostics.failureCategory, 'request');
  assert.ok(!JSON.stringify(result).includes('offline-test-key'));
});

test('rejects output cut off by the model token limit', async () => {
  globalThis.fetch.mock.mockImplementation(async () => Response.json({ candidates: [{ content: { role: 'model', parts: [{ text: '{"findings":[]}' }] }, finishReason: 'MAX_TOKENS' }] }));
  const result = await aiService.runAiAnalysis(reviewPr);
  assert.equal(result.status, 'unavailable');
  assert.equal(result.error, 'INVALID_RESPONSE');
});

test('smoke CLI reports a missing key safely and exits unsuccessfully', () => {
  const execution = spawnSync(process.execPath, [fileURLToPath(new URL('../scripts/gemini-smoke.js', import.meta.url))], {
    cwd: fileURLToPath(new URL('../../', import.meta.url)),
    env: { ...process.env, GEMINI_API_KEY: '' },
    encoding: 'utf8',
    timeout: 5000
  });
  assert.equal(execution.status, 1);
  assert.equal(JSON.parse(execution.stdout).code, 'MISSING_API_KEY');
  assert.equal(execution.stderr, '');
});
