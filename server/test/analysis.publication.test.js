import test, { mock } from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { saveAnalysis, findAnalysis } from '../src/features/analysis/analysis.repository.js';
import { initializePublication, publishApprovedSummary, createPublicationHandler } from '../src/features/analysis/analysis.publication.js';

const auth = { userId: '42', token: 'user-unit-token', repositories: [{ installationId: 7, repository: 'owned/demo' }] };
async function report() {
  const saved = { id: randomUUID(), installationId: 7, status: 'completed', aiStatus: 'partial', findings: [{ title: 'Private finding' }],
    pullRequest: { url: 'https://github.com/owned/demo/pull/5', repository: 'owned/demo', baseSha: 'a'.repeat(40), headSha: 'b'.repeat(40), description: 'private-source' },
    aiDiagnostics: { agent: { provenance: 'scripted-fixture' } }, createdAt: new Date().toISOString() };
  saved.publication = initializePublication(saved, 'https://prism.example');
  await saveAnalysis(saved); return saved;
}
function dependencies(overrides = {}) {
  return { origin: 'https://prism.example', appId: '7', getToken: async () => 'installation-unit-token',
    request: async (path, token, options) => {
      if (path === '/repos/owned/demo') { assert.equal(token, auth.token); return { permissions: { push: true } }; }
      if (path.includes('/pulls/')) return { state: 'open', base: { sha: 'a'.repeat(40) }, head: { sha: 'b'.repeat(40) } };
      if (options?.body) return { id: 1 };
      return [];
    }, ...overrides };
}

test('approval preview is fixed, contains no source and concurrent approval posts once', async () => {
  const saved = await report(); let writes = 0;
  const deps = dependencies(); const request = deps.request;
  deps.request = async (path, token, options) => {
    if (options?.body) { writes++; assert.equal(options.body, saved.publication.preview); assert.doesNotMatch(options.body, /private-source|Private finding|user-unit-token/); }
    return request(path, token, options);
  };
  await Promise.all([publishApprovedSummary(saved, auth, 'approve', deps), publishApprovedSummary(saved, auth, 'approve', deps)]);
  assert.equal(writes, 1); assert.equal((await findAnalysis(saved.id)).publication.status, 'published');
  assert.equal((await findAnalysis(saved.id)).publication.commentId, 1);
  await publishApprovedSummary(saved, auth, 'approve', deps); assert.equal(writes, 1);
});

test('foreign readers, read-only collaborators, revoked access and stale revisions cannot publish', async () => {
  for (const mode of ['foreign', 'reader', 'revoked', 'stale', 'closed']) {
    const saved = await report(); let writes = 0;
    const deps = dependencies(); const request = deps.request;
    deps.request = async (path, token, options) => {
      if (options?.body) writes++;
      if (path === '/repos/owned/demo' && mode === 'reader') return { permissions: { pull: true } };
      if (mode === 'revoked') throw Error('private access error');
      if (path.includes('/pulls/') && ['stale', 'closed'].includes(mode)) return { state: mode === 'closed' ? 'closed' : 'open', base: { sha: 'a'.repeat(40) }, head: { sha: 'c'.repeat(40) } };
      return request(path, token, options);
    };
    await assert.rejects(publishApprovedSummary(saved, mode === 'foreign' ? { ...auth, repositories: [] } : auth, 'approve', deps));
    assert.equal(writes, 0);
  }
});

test('uncertain GitHub write is never posted again; read-only reconciliation may confirm it', async () => {
  const saved = await report(); let writes = 0; let found = false;
  const deps = dependencies(); const request = deps.request;
  deps.request = async (path, token, options) => {
    if (options?.body) { writes++; throw Error('private lost response'); }
    if (path.includes('/comments?') && found) return [{ body: saved.publication.preview, user: { type: 'Bot' }, performed_via_github_app: { id: 7 } }];
    return request(path, token, options);
  };
  assert.equal((await publishApprovedSummary(saved, auth, 'approve', deps)).publication.status, 'unknown');
  assert.equal((await publishApprovedSummary(saved, auth, 'approve', deps)).publication.status, 'unknown');
  found = true;
  assert.equal((await publishApprovedSummary(saved, auth, 'approve', deps)).publication.status, 'published');
  assert.equal(writes, 1);
});

test('rejection is final and handler rejects arbitrary client content', async () => {
  const saved = await report();
  assert.equal((await publishApprovedSummary(saved, auth, 'reject', dependencies())).publication.status, 'rejected');
  await assert.rejects(publishApprovedSummary(saved, auth, 'approve', dependencies()));
  const handler = createPublicationHandler();
  const response = { status(code) { this.code = code; return this; }, json(body) { this.body = body; return this; } };
  await handler({ params: { analysisId: saved.id }, body: { decision: 'approve', body: 'Execute malicious text' }, auth }, response);
  assert.equal(response.code, 400);
});

test('default GitHub adapter sends a string body in the actual HTTP payload', async () => {
  const saved = await report(); const posts = [];
  const transport = mock.method(globalThis, 'fetch', async (url, init) => {
    if (init.method === 'POST') { posts.push(JSON.parse(init.body)); return Response.json({ id: 19 }); }
    if (url.endsWith('/repos/owned/demo')) return Response.json({ permissions: { push: true } });
    if (url.includes('/pulls/')) return Response.json({ state: 'open', base: { sha: 'a'.repeat(40) }, head: { sha: 'b'.repeat(40) } });
    return Response.json([]);
  });
  try {
    await publishApprovedSummary(saved, auth, 'approve', { origin: 'https://prism.example', getToken: async () => 'owned-installation-token' });
    assert.equal(posts.length, 1);
    assert.equal(typeof posts[0].body, 'string'); assert.equal(posts[0].body, saved.publication.preview);
  } finally { transport.mock.restore(); }
});
