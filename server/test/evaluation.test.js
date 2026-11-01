import assert from 'node:assert/strict';
import { mkdtemp, readFile, readdir, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { basename, dirname, join, resolve } from 'node:path';
import { test } from 'node:test';
import { collectEvaluation, parseOptions, saveRun, toPullRequest, compareRetrieval } from '../scripts/evaluate-ai.js';

async function cleanup(directory) {
  assert.equal(dirname(resolve(directory)), resolve(tmpdir()));
  assert.ok(basename(directory).startsWith('prism-eval-'));
  await rm(directory, { recursive: true, force: true });
}

test('dry-run prepares frozen cases without calling a provider or exposing labels', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'prism-eval-'));
  try {
    const path = join(directory, 'dry.json');
    const run = await collectEvaluation({ outPath: path, caseId: 'B01' }, async () => assert.fail('Dry run must not call AI'));
    assert.equal(run.mode, 'dry-run');
    assert.equal(run.cases[0].status, 'not_run');
    assert.equal(run.cases[0].attempts, 0);
    assert.equal((await readFile(path, 'utf8')).includes('GEMINI_API_KEY'), false);
    const source = JSON.parse(await readFile(new URL('../../docs/beta/evaluation-cases.json', import.meta.url), 'utf8'));
    const input = toPullRequest(source.cases[0]);
    assert.ok(!('bugs' in input));
    assert.ok(!('id' in input));
    assert.ok(!JSON.stringify(input).includes('B01'));
    assert.match(input.changedFiles[0].patch, /@@ -1,4 \+1,3 @@/);
    await assert.rejects(collectEvaluation({ outPath: path, caseId: 'B01' }), /exists|EEXIST/i);
  } finally { await cleanup(directory); }
});

test('live collection records failure without retries, keeps remaining cases and saves model metadata', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'prism-eval-'));
  let calls = 0;
  try {
    const run = await collectEvaluation({ outPath: join(directory, 'run.json'), live: true, split: 'heldout' }, async input => {
      calls++;
      assert.ok(!JSON.stringify(input).includes('locations'));
      if (calls === 1) throw Error('sensitive-upstream-detail');
      return { status: 'partial', model: 'offline-test-model', findings: [], diagnostics: { attempts: 1, durationMs: 25, timeoutMs: 100 }, coverage: { rejectedFindings: 1 } };
    });
    assert.equal(calls, 4);
    assert.equal(run.cases.length, 4);
    assert.equal(run.cases[0].status, 'unavailable');
    assert.equal(run.cases[1].model, 'offline-test-model');
    assert.equal(run.cases[1].rejectedFindings, 1);
    assert.ok(!JSON.stringify(run).includes('sensitive-upstream-detail'));
    assert.match(run.engine.aiServiceSha256, /^[a-f\d]{64}$/);
    assert.equal(run.judgments.length, 0);
  } finally { await cleanup(directory); }
});

test('CLI requires an explicit live selection and output, rejects accidental flags', () => {
  assert.throws(() => parseOptions(['--live', '--out', 'x.json']), /case|split/i);
  assert.throws(() => parseOptions(['--live', '--case', 'B01']), /out/i);
  assert.throws(() => parseOptions(['--out', 'x.json', '--typo']), /Unknown/);
  assert.throws(() => parseOptions(['--out', 'x.json', '--case', 'B01', '--case', 'B02']), /Duplicate/);
  assert.equal(parseOptions(['--out', 'x.json', '--case', 'B01']).live, false);
});

test('failed atomic replacement preserves the preceding valid artifact and cleans its temp file', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'prism-eval-'));
  const path = join(directory, 'run.json');
  try {
    await saveRun(path, { step: 1 });
    await assert.rejects(saveRun(path, { step: 2 }, async () => { throw Error('simulated rename failure'); }), /simulated/);
    assert.deepEqual(JSON.parse(await readFile(path, 'utf8')), { step: 1 });
    assert.deepEqual(await readdir(directory), ['run.json']);
  } finally { await cleanup(directory); }
});

test('atomic save retries only transient Windows file locks, never model requests', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'prism-eval-'));
  let attempts = 0;
  try {
    const path = join(directory, 'run.json');
    await saveRun(path, { step: 2 }, async (from, to) => {
      if (++attempts < 3) throw Object.assign(Error('locked'), { code: 'EPERM' });
      const { rename } = await import('node:fs/promises');
      await rename(from, to);
    });
    assert.equal(attempts, 3);
    assert.equal(JSON.parse(await readFile(path, 'utf8')).step, 2);
  } finally { await cleanup(directory); }
});

test('live collector stops the batch after provider quota rejection', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'prism-eval-'));
  let calls = 0;
  try {
    const run = await collectEvaluation({ outPath: join(directory, 'run.json'), live: true, split: 'dev' }, async () => {
      calls++;
      return { status: 'unavailable', findings: [], error: 'API_ERROR', diagnostics: { attempts: 1, httpStatus: 429 } };
    });
    assert.equal(calls, 1);
    assert.equal(run.stopReason, 'RATE_LIMIT');
    assert.equal(run.cases[1].status, 'not_run');
  } finally { await cleanup(directory); }
});

test('retrieval compares lexical and optional vectors without sending relevance labels', async () => {
  const dataset = { documents: [{ id: 'setup', path: 'README.md', revision: 'fixture-v1', startLine: 1, text: '# Setup\nInstall dependencies' }, { id: 'auth', path: 'CONTRIBUTING.md', revision: 'fixture-v1', startLine: 1, text: '# Authorization\nOnly owners delete notes' }], queries: [{ caseId: 'B01', text: 'owners delete notes', relevant: ['auth'] }] };
  const offline = await compareRetrieval(dataset);
  assert.equal(offline.lexical.hitAt1, 1);
  assert.equal(offline.semantic, null);
  let calls = 0;
  const result = await compareRetrieval(dataset, async (texts, taskType) => {
    calls++;
    assert.ok(!JSON.stringify(texts).includes('relevant'));
    return taskType === 'RETRIEVAL_DOCUMENT' ? [[1, 0], [0, 1]] : [[0, 1]];
  });
  assert.equal(calls, 2);
  assert.equal(result.semantic.hitAt1, 1);
  await assert.rejects(compareRetrieval(dataset, async () => [[NaN]]), /embedding/i);
});
