import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { afterEach, beforeEach, mock, test } from 'node:test';
import * as aiService from '../src/features/ai/ai.service.js';

const expected = { status: 'ok', provider: 'gemini', message: 'Connection successful' };
const environmentKeys = ['GEMINI_API_KEY', 'GEMINI_MODEL', 'AI_API_URL', 'AI_API_KEY'];
let originalEnvironment;

beforeEach(() => {
  originalEnvironment = Object.fromEntries(environmentKeys.map((key) => [key, process.env[key]]));
  process.env.GEMINI_API_KEY = 'offline-test-key';
  delete process.env.GEMINI_MODEL;
  delete process.env.AI_API_URL;
  delete process.env.AI_API_KEY;
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

test('Gemini configuration does not activate the existing PR review pipeline', async () => {
  assert.deepEqual(await aiService.runAiAnalysis({ changedFiles: [] }), { status: 'skipped', findings: [] });
  assert.equal(globalThis.fetch.mock.callCount(), 0);
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
