import assert from 'node:assert/strict';
import { after, test } from 'node:test';
import { fileURLToPath } from 'node:url';
import { createServer } from 'vite';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';

// Use the existing JSX transformer; no browser or external API is needed.
const vite = await createServer({
  root: fileURLToPath(new URL('../', import.meta.url)),
  server: { middlewareMode: true },
  appType: 'custom'
});
after(() => vite.close());
const viewer = await vite.ssrLoadModule('/src/features/dashboard/DiffViewer.jsx');
const dashboard = await vite.ssrLoadModule('/src/features/dashboard/DashboardPage.jsx');

test('progress panel marks only stages preceding the actual backend stage as done', () => {
  const html = renderToStaticMarkup(createElement(dashboard.AnalysisProgress, { stage: 'context', elapsedSeconds: 17 }));
  assert.match(html, /Building review context/);
  assert.match(html, /aria-current="step"/);
  assert.match(html, /17s elapsed/);
  assert.match(html, /Your context is being read/);
  assert.equal((html.match(/data-state="complete"/g) || []).length, 1);
  assert.equal((html.match(/data-state="pending"/g) || []).length, 2);
  assert.ok(!html.includes('%'));
});

test('workspace places the diff beside accessible overview and findings controls', () => {
  const html = renderToStaticMarkup(createElement(dashboard.AnalysisReport, { analysis: { id: 'workspace', status: 'completed', pullRequest: { title: 'Example PR', changedFiles: [] }, findings: [] } }));
  assert.match(html, /class="review-workbench"/);
  assert.match(html, /aria-label="Review views"/);
  assert.match(html, /aria-pressed="true"[^>]*>Overview/);
  assert.match(html, /Findings/);
  assert.match(html, /aria-label="Review panel"/);
  assert.match(html, /No contextual AI review is available/);
  assert.match(html, /Changed files/);
});

test('renders contextual AI review, referenced impacts and advisory merge guidance', () => {
  const reference = { filePath: 'a.js', lineSide: 'old', lineNumber: 5, evidence: 'guard();' };
  const html = renderToStaticMarkup(createElement(dashboard.AnalysisReport, { analysis: {
    id: 'context', status: 'completed', aiStatus: 'partial', pullRequest: { changedFiles: [{ path: 'a.js', patch: '@@ -5 +4,0 @@\n-guard();', additions: 0, deletions: 1 }] }, findings: [],
    aiReview: { summary: 'Removes a guard.', recommendation: 'insufficient_context', walkthrough: [{ filePath: 'a.js', description: 'Guard removed.', evidenceRefs: [reference] }], impacts: [{ description: 'Invalid users may reach the handler.', evidenceRefs: [reference] }], limitations: ['Callers were not supplied.'] }
  } }));
  assert.match(html, /Removes a guard/);
  assert.match(html, /Potential impact/);
  assert.match(html, /More context needed/);
  assert.match(html, /View old line 5/);
  assert.match(html, /Callers were not supplied/);
});

test('resolves old-side locations without confusing a same-number new line', () => {
  const files = [{ path: 'a.js', patch: '@@ -5 +5 @@\n-old\n+new' }];
  assert.equal(viewer.findDiffLocation(files, { filePath: 'a.js', lineSide: 'old', lineNumber: 5 }).text, 'old');
  assert.equal(viewer.findDiffLocation(files, { filePath: 'a.js', lineSide: 'invalid', lineNumber: 5 }), null);
});

test('reopened failure uses safe error-code guidance and hides unknown raw errors', () => {
  const report = { id: 'failed', status: 'failed', pullRequest: {}, findings: [], errorCode: 'REVISION_CHANGED', error: 'private raw upstream data' };
  const html = renderToStaticMarkup(createElement(dashboard.AnalysisReport, { analysis: report }));
  assert.match(html, /revision changed/);
  assert.ok(!html.includes('private raw upstream data'));
});

test('report renders advisory AI failure, coverage, revision and safe evidence', () => {
  const html = renderToStaticMarkup(createElement(dashboard.AnalysisReport, { analysis: {
    id: 'fixture', status: 'completed', aiStatus: 'unavailable', aiError: 'API_ERROR',
    createdAt: '2026-10-31T00:00:00Z', aiDiagnostics: { httpStatus: 504, durationMs: 1500, attempts: 1 },
    pullRequest: { headSha: '1234567890', headBranch: 'fix', baseSha: 'abcdef1234', baseBranch: 'main', filesComplete: false, totalChangedFiles: 2,
      changedFiles: [{ path: 'a.js', patch: '@@ -0,0 +1 @@\n+<script>unsafe</script>', additions: 1, deletions: 0 }] },
    findings: [{ source: 'ai', title: 'Check output', severity: 'high', filePath: 'a.js', lineNumber: 1, evidence: '<script>unsafe</script>', explanation: 'Example', suggestedFix: 'Escape output' }]
  } }));
  assert.match(html, /Rule-based analysis completed/);
  assert.match(html, /AI analysis unavailable/);
  assert.match(html, /processing deadline/);
  assert.match(html, /File retrieval is incomplete/);
  assert.match(html, /12345678/);
  assert.match(html, /View new line 1 in diff/);
  assert.match(html, /&lt;script&gt;unsafe&lt;\/script&gt;/);
  assert.ok(!html.includes('<script>unsafe</script>'));
  assert.ok(!html.includes('AI analysis completed'));
});

test('old saved reports without revision or AI metadata still render', () => {
  const html = renderToStaticMarkup(createElement(dashboard.AnalysisReport, { analysis: { id: '1', status: 'completed', createdAt: 'invalid', pullRequest: {}, findings: [] } }));
  assert.match(html, /Revision not recorded/);
  assert.match(html, /AI status not recorded/);
  assert.match(html, /No changed files/);
  assert.match(html, /Date unavailable/);
});

test('diff initial focus selects the actual target file and highlights its row', () => {
  const html = renderToStaticMarkup(createElement(viewer.default, {
    files: [{ path: 'first.js', patch: '' }, { path: 'target.js', previousPath: 'old.js', patch: '@@ -0,0 +10 @@\n+target();', additions: 1, deletions: 0 }],
    focusLocation: { filePath: 'target.js', lineNumber: 10 }
  }));
  assert.match(html, /Renamed from/);
  assert.match(html, /diff-line-focused/);
  assert.match(html, /Diff for target.js/);
});

test('finding navigation resolves only existing new-side lines', () => {
  const files = [{ path: 'a.js', patch: '@@ -5 +10 @@\n-old\n+new' }];
  assert.equal(viewer.findDiffLocation(files, { filePath: 'a.js', lineNumber: 10 }).text, 'new');
  for (const finding of [
    { filePath: 'missing.js', lineNumber: 10 },
    { filePath: 'a.js', lineNumber: 5 },
    { filePath: 'a.js', lineNumber: '10' },
    { filePath: 'a.js', lineNumber: 0 }
  ]) assert.equal(viewer.findDiffLocation(files, finding), null);
});

test('unsafe hunk coordinates remain unnumbered', () => {
  const result = viewer.parseUnifiedDiff('@@ -9007199254740992 +1 @@\n-old\n+new');
  assert.equal(result.incomplete, true);
  assert.ok(result.lines.every(line => line.oldNumber === null && line.newNumber === null));
});

test('numbers replacements and context using both hunk ranges', () => {
  assert.equal(typeof viewer.parseUnifiedDiff, 'function');
  const result = viewer.parseUnifiedDiff('@@ -10,3 +20,4 @@ function\n before\n-old\n+new\n+extra\n after');
  assert.deepEqual(result.lines.slice(1), [
    { kind: 'context', oldNumber: 10, newNumber: 20, text: 'before' },
    { kind: 'deleted', oldNumber: 11, newNumber: null, text: 'old' },
    { kind: 'added', oldNumber: null, newNumber: 21, text: 'new' },
    { kind: 'added', oldNumber: null, newNumber: 22, text: 'extra' },
    { kind: 'context', oldNumber: 12, newNumber: 23, text: 'after' }
  ]);
  assert.equal(result.incomplete, false);
});

test('resets counters for multiple hunks and omitted counts', () => {
  const result = viewer.parseUnifiedDiff('@@ -1 +1 @@\n-old\n+new\n@@ -100 +200 @@\n-x\n+y');
  assert.equal(result.lines[4].oldNumber, 100);
  assert.equal(result.lines[5].newNumber, 200);
  assert.equal(result.incomplete, false);
});

test('handles added and deleted files with zero-length ranges', () => {
  const added = viewer.parseUnifiedDiff('@@ -0,0 +1,2 @@\n+one\n+two\n');
  assert.deepEqual(added.lines.slice(1).map((line) => [line.oldNumber, line.newNumber]), [[null, 1], [null, 2]]);
  const deleted = viewer.parseUnifiedDiff('@@ -1,2 +0,0 @@\n-one\n-two');
  assert.deepEqual(deleted.lines.slice(1).map((line) => [line.oldNumber, line.newNumber]), [[1, null], [2, null]]);
  assert.equal(added.incomplete || deleted.incomplete, false);
});

test('keeps metadata unnumbered without mistaking source prefixes for headers', () => {
  const result = viewer.parseUnifiedDiff('--- a/file\n+++ b/file\n@@ -1 +1 @@\n---old\n\\ No newline at end of file\n+++new\n\\ No newline at end of file');
  assert.equal(result.lines[0].oldNumber, null);
  assert.equal(result.lines[1].newNumber, null);
  assert.deepEqual(result.lines[3], { kind: 'deleted', oldNumber: 1, newNumber: null, text: '--old' });
  assert.deepEqual(result.lines[5], { kind: 'added', oldNumber: null, newNumber: 1, text: '++new' });
  assert.equal(result.incomplete, false);
});

test('flags incomplete hunks, including before a later complete hunk', () => {
  assert.equal(viewer.parseUnifiedDiff('@@ -1,2 +1,2 @@\n one').incomplete, true);
  assert.equal(viewer.parseUnifiedDiff('@@ -1,2 +1,2 @@\n one\n@@ -10 +10 @@\n two').incomplete, true);
});

test('never assigns guessed numbers after malformed or overlong hunk data', () => {
  const overlong = viewer.parseUnifiedDiff('@@ -1 +1 @@\n valid\n extra\n+more');
  assert.equal(overlong.incomplete, true);
  assert.equal(overlong.lines[2].oldNumber, null);
  assert.equal(overlong.lines[3].newNumber, null);
  const malformed = viewer.parseUnifiedDiff('@@ broken @@\n+unknown');
  assert.equal(malformed.incomplete, true);
  assert.equal(malformed.lines[1].newNumber, null);
});

test('preserves whitespace, blank code lines and CRLF without inventing hunks', () => {
  const result = viewer.parseUnifiedDiff('@@ -1 +1,2 @@\r\n \t  \r\n+\r\n');
  assert.equal(result.lines[1].text, '\t  ');
  assert.equal(result.lines[2].text, '');
  assert.equal(result.incomplete, false);
  assert.equal(viewer.parseUnifiedDiff('raw patch content').hasHunks, false);
  assert.equal(viewer.parseUnifiedDiff('').lines.length, 0);
});
