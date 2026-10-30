import assert from 'node:assert/strict';
import { afterEach, beforeEach, mock, test } from 'node:test';
import { createAnalysis } from '../src/features/analysis/analysis.controller.js';
import { findAnalysis } from '../src/features/analysis/analysis.repository.js';
import Analysis from '../src/features/analysis/analysis.model.js';

let originalKey;
let originalModel;
const file = { filename: 'src/math.service.js', status: 'modified', additions: 1, deletions: 1, changes: 2, patch: '@@ -1 +1 @@\n-return value * 2;\n+return value / 2;' };
const finding = { title: 'Unexpected division', severity: 'medium', filePath: file.filename, lineNumber: 1, explanation: 'The result now halves instead of doubles.', suggestedFix: 'Confirm the intended behavior before restoring multiplication.', evidence: 'return value / 2;' };

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

function mockRequests(aiFailure) {
  mock.method(globalThis, 'fetch', async (url) => {
    if (String(url).startsWith('https://api.github.com/')) {
      return Response.json(String(url).includes('/files?') ? [file] : { title: 'Fixture PR', html_url: 'https://github.com/audit/repo/pull/1', user: { login: 'audit' } });
    }
    if (aiFailure) return Response.json({ error: { code: 503, message: 'private provider data', status: 'UNAVAILABLE' } }, { status: 503 });
    return Response.json({ candidates: [{ content: { role: 'model', parts: [{ text: JSON.stringify({ findings: [finding] }) }] }, finishReason: 'STOP' }] });
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

test('controller saves AI findings alongside deterministic findings', async () => {
  mockRequests(false);
  const report = await createReport();
  assert.equal(report.aiStatus, 'completed');
  assert.equal(report.aiModel, 'gemini-3.8-flash');
  assert.equal(report.aiCoverage.analyzedFiles, 1);
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
  assert.ok(!JSON.stringify(report).includes('private provider data'));
});
