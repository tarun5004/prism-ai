import assert from 'node:assert/strict';
import { afterEach, mock, test } from 'node:test';
import { fetchPullRequest, fetchReviewContext } from '../src/features/pullRequest/pullRequest.service.js';

afterEach(() => mock.restoreAll());
const url = 'https://github.com/demo/project/pull/12';
const metadata = { title: 'Example', html_url: url, changed_files: 101, base: { ref: 'main', sha: 'base' }, head: { ref: 'fix', sha: 'head' } };
const file = { filename: 'new.js', previous_filename: 'old.js', status: 'renamed', additions: 1, deletions: 0, changes: 1, patch: '@@ -0,0 +1 @@\n+hello();' };

test('retrieves bounded revision-pinned source windows and a direct import', async () => {
  const addresses = [];
  mock.method(globalThis, 'fetch', async address => {
    addresses.push(String(address));
    const code = String(address).includes('helper.ts') ? 'export const helper = 1;' : 'import { helper } from "./helper";\nexport const value = helper;';
    return Response.json({ encoding: 'base64', content: Buffer.from(code).toString('base64'), size: code.length });
  });
  const result = await fetchReviewContext({ url, baseSha: 'base', headSha: 'head', changedFiles: [{ path: 'src/main.ts', status: 'modified', additions: 1, deletions: 1, patch: '@@ -2 +2 @@\n-old\n+new' }] });
  assert.equal(result.snippets.length, 2);
  assert.equal(result.snippets[0].startLine, 1);
  assert.equal(result.snippets[0].lineSide, 'new');
  assert.equal(result.snippets[1].filePath, 'src/helper.ts');
  assert.ok(addresses.every(address => address.includes('ref=head')));
});

test('uses the base revision and previous filename for deleted-only renamed code', async () => {
  let address;
  mock.method(globalThis, 'fetch', async value => {
    address = String(value);
    return Response.json({ encoding: 'base64', content: Buffer.from('old();').toString('base64'), size: 6 });
  });
  const result = await fetchReviewContext({ url, baseSha: 'base', headSha: 'head', changedFiles: [{ path: 'new.ts', previousPath: 'old.ts', additions: 0, deletions: 1, patch: '@@ -1 +0,0 @@\n-old();' }] });
  assert.match(address, /contents\/old.ts\?ref=base/);
  assert.equal(result.snippets[0].lineSide, 'old');
  assert.equal(result.snippets[0].filePath, 'new.ts');
});

test('context retrieval reports unavailable content and bounds its requests', async () => {
  const request = mock.method(globalThis, 'fetch', async () => Response.json({ size: 999999, encoding: 'base64', content: '' }));
  const result = await fetchReviewContext({ url, baseSha: 'base', headSha: 'head', changedFiles: Array.from({ length: 10 }, (_, n) => ({ path: `src/file${n}.ts`, patch: '@@ -1 +1 @@\n-a\n+b' })) });
  assert.equal(result.snippets.length, 0);
  assert.equal(request.mock.callCount(), 5);
  assert.ok(result.omitted.length >= 5);
});

test('paginates files and preserves patches, rename and commit revisions', async () => {
  const requests = [];
  mock.method(globalThis, 'fetch', async (address, options) => {
    requests.push(String(address));
    assert.ok(options.signal instanceof AbortSignal);
    if (!String(address).includes('/files?')) return Response.json(metadata);
    return Response.json(String(address).includes('page=2') ? [file] : Array.from({ length: 100 }, (_, i) => ({ ...file, filename: `file-${i}.js` })));
  });
  const result = await fetchPullRequest(url);
  assert.equal(result.changedFiles.length, 101);
  assert.equal(result.changedFiles[100].patch, file.patch);
  assert.equal(result.changedFiles[100].previousPath, 'old.js');
  assert.equal(result.baseSha, 'base');
  assert.equal(result.headSha, 'head');
  assert.equal(result.filesComplete, true);
  assert.equal(result.totalChangedFiles, 101);
  assert.equal(requests.length, 4); // metadata, two file pages, revision check
});

test('marks incomplete retrieval and missing patches explicitly', async () => {
  mock.method(globalThis, 'fetch', async address => Response.json(String(address).includes('/files?') ? [{ ...file, patch: undefined }] : metadata));
  const result = await fetchPullRequest(url);
  assert.equal(result.filesComplete, false);
  assert.equal(result.changedFiles[0].patchAvailable, false);
  assert.equal(result.changedFiles[0].patch, '');
});

test('refuses a report when the PR revision changes during retrieval', async () => {
  let metadataRequests = 0;
  mock.method(globalThis, 'fetch', async address => {
    if (String(address).includes('/files?')) return Response.json([file]);
    return Response.json({ ...metadata, head: { sha: ++metadataRequests === 1 ? 'head' : 'updated' } });
  });
  await assert.rejects(fetchPullRequest(url), /changed while/);
});

test('bounds pagination to 3000 files and reports incomplete coverage', async () => {
  let pages = 0;
  mock.method(globalThis, 'fetch', async address => {
    if (!String(address).includes('/files?')) return Response.json({ ...metadata, changed_files: 3001 });
    pages++;
    return Response.json(Array(100).fill(file));
  });
  const result = await fetchPullRequest(url);
  assert.equal(pages, 30);
  assert.equal(result.changedFiles.length, 3000);
  assert.equal(result.filesComplete, false);
});

test('rejects invalid URLs without requesting GitHub', async () => {
  const request = mock.method(globalThis, 'fetch', () => { throw Error('must not fetch'); });
  await assert.rejects(fetchPullRequest('https://github.com/a/b/pull/0'), /valid GitHub/);
  assert.equal(request.mock.callCount(), 0);
});

test('rejects oversized snapshots before AI work or more GitHub requests', async () => {
  const request = mock.method(globalThis, 'fetch', async address => Response.json(String(address).includes('/files?')
    ? Array(50).fill({ ...file, patch: 'x'.repeat(100000) }) : metadata));
  await assert.rejects(fetchPullRequest(url), error => error.statusCode === 413 && /4 MiB/.test(error.message));
  assert.equal(request.mock.callCount(), 2);
});

test('sanitizes rate-limit, network and timeout failures without retrying', async () => {
  const request = mock.method(globalThis, 'fetch', async () => Response.json({ message: 'private upstream data' }, { status: 403, headers: { 'x-ratelimit-remaining': '0' } }));
  await assert.rejects(fetchPullRequest(url), /rate limit/);
  assert.equal(request.mock.callCount(), 1);
  request.mock.mockImplementation(async () => { throw Error('private transport details'); });
  await assert.rejects(fetchPullRequest(url), /^Error: Could not connect to GitHub/);
  request.mock.mockImplementation(async () => { throw new DOMException('private detail', 'TimeoutError'); });
  await assert.rejects(fetchPullRequest(url), /timed out/);
});
