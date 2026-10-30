import assert from 'node:assert/strict';
import { test } from 'node:test';
import { prepareAiInput } from '../src/features/ai/ai.context.js';

const file = (overrides = {}) => ({ path: 'src/example.js', additions: 1, deletions: 1, patch: '@@ -10 +20 @@\n-old();\n+next();', ...overrides });

test('prepares real new-side line references without PR metadata', () => {
  const result = prepareAiInput({ title: 'unnecessary title', changedFiles: [file()] });
  assert.deepEqual(result.files, [{ filePath: 'src/example.js', lines: [
    { lineNumber: null, change: 'deleted', code: 'old();' },
    { lineNumber: 20, change: 'added', code: 'next();' }
  ] }]);
  assert.equal(JSON.stringify(result.files).includes('unnecessary title'), false);
  assert.equal(result.coverage.analyzedFiles, 1);
});

test('handles multiple hunks, context and no-newline markers', () => {
  const result = prepareAiInput({ changedFiles: [file({ additions: 2, deletions: 0, patch: '@@ -2 +2,2 @@\n context();\n+first();\n@@ -8,0 +9 @@\n+second();\n\\ No newline at end of file' })] });
  assert.deepEqual(result.files[0].lines.filter(line => line.change === 'added').map(line => line.lineNumber), [3, 9]);
  assert.deepEqual(result.coverage.truncatedFiles, []);
});

test('skips unavailable, binary, deleted-only and non-code input', () => {
  const result = prepareAiInput({ changedFiles: [file({ path: 'a.js', patch: '' }), file({ path: 'b.js', patch: 'GIT binary patch' }), file({ path: 'c.js', additions: 0, patch: '@@ -1 +0,0 @@\n-old();' }), file({ path: 'README.md' })] });
  assert.equal(result.files.length, 0);
  assert.equal(result.coverage.skippedFiles.length, 4);
});

test('does not send sensitive paths or credential-bearing patches', () => {
  const result = prepareAiInput({ changedFiles: [file({ path: '.env' }), file({ path: 'src/credentials.js' }), file({ patch: '@@ -0,0 +1 @@\n+const apiKey = "do-not-send-this-value";' })] });
  assert.equal(result.files.length, 0);
  assert.equal(JSON.stringify(result).includes('do-not-send-this-value'), false);
});

test('excludes recognizable cloud tokens and credential-bearing connection URLs', () => {
  for (const code of ['const key = "AKIAABCDEFGHIJKLMNOP";', 'const token = "github_pat_' + 'x'.repeat(30) + '";', 'connect("postgres://account:private-value@db.example/app");']) {
    const result = prepareAiInput({ changedFiles: [file({ additions: 1, deletions: 0, patch: '@@ -0,0 +1 @@\n+' + code })] });
    assert.equal(result.files.length, 0);
    assert.equal(JSON.stringify(result).includes(code), false);
  }
});

test('does not send unquoted shell credential assignments', () => {
  for (const code of ['export PASSWORD=offline-placeholder', 'API_KEY=offline-placeholder', 'APP_ACCESS_TOKEN=offline-placeholder']) {
    const result = prepareAiInput({ changedFiles: [file({ path: 'scripts/deploy.sh', additions: 1, deletions: 0, patch: '@@ -0,0 +1 @@\n+' + code })] });
    assert.equal(result.files.length, 0);
    assert.equal(result.coverage.skippedFiles[0].reason, 'sensitive-content');
  }
});

test('marks malformed, incomplete and count-mismatched patches explicitly', () => {
  for (const patch of ['@@ broken @@\n+next();', '@@ -10,2 +20,2 @@\n-old();\n+next();', '@@ -10 +20 @@\n-old();\n+next();\n+extra();']) {
    const result = prepareAiInput({ changedFiles: [file({ patch })] });
    assert.ok(result.coverage.skippedFiles.length || result.coverage.truncatedFiles.length);
    assert.ok(result.files.flatMap(file => file.lines).every(line => line.lineNumber === null || Number.isSafeInteger(line.lineNumber)));
  }
  assert.deepEqual(prepareAiInput({ changedFiles: [file({ additions: 2 })] }).coverage.truncatedFiles, ['src/example.js']);
});

test('bounds files and serialized input without slicing code lines', () => {
  const result = prepareAiInput({ changedFiles: Array.from({ length: 8 }, (_, index) => file({ path: `src/file${index}.js`, additions: 60, deletions: 0, patch: '@@ -0,0 +1,60 @@\n' + Array.from({ length: 60 }, () => '+' + 'x'.repeat(90)).join('\n') })) });
  assert.ok(result.files.length <= 5);
  assert.ok(JSON.stringify(result.files).length <= 12000);
  assert.ok(result.files.every(file => JSON.stringify(file).length <= 4000));
  assert.ok(result.coverage.truncatedFiles.length > 0);
  assert.ok(result.files.flatMap(file => file.lines).every(line => line.code === 'x'.repeat(90)));
});
