import assert from 'node:assert/strict';
import { afterEach, mock, test } from 'node:test';
import * as github from '../src/features/pullRequest/github.app.js';
import express from 'express';
import { generateKeyPairSync, verify } from 'node:crypto';
import app from '../src/app.js';

afterEach(() => mock.restoreAll());

test('private API routes isolate repositories, derive feedback identity and recheck revoked access', async () => {
  const { writeAuthRecord } = await import('../src/features/pullRequest/github.repository.js');
  const { saveAnalysis, findAnalysis, enqueueReviewJob } = await import('../src/features/analysis/analysis.repository.js');
  const keys = ['GITHUB_APP_ID', 'APP_ORIGIN'];
  const old = keys.map(key => process.env[key]);
  process.env.GITHUB_APP_ID = '7';
  process.env.APP_ORIGIN = 'http://localhost:5173';
  let revoked = false;
  const realFetch = globalThis.fetch;
  mock.method(globalThis, 'fetch', async (url, options) => {
    if (String(url).startsWith('http://127.0.0.1')) return realFetch(url, options);
    const alice = options.headers.Authorization === 'Bearer alice-token';
    const installationId = alice ? 91 : 92;
    if (String(url).includes('/repositories?')) return Response.json({ repositories: [{ full_name: alice ? 'owner/private-a' : 'owner/private-b' }] });
    if (String(url).includes('/user/installations?')) return Response.json({ installations: alice && revoked ? [] : [{ id: installationId, app_id: 7 }] });
    throw Error('Unexpected external request in access test.');
  });
  for (const [userId, name] of [['901', 'alice'], ['902', 'bob']]) {
    await writeAuthRecord('session', `access-${name}`, { userId, token: `${name}-token` }, Date.now() + 60000);
    const id = `private-access-${name}`;
    const repository = name === 'alice' ? 'owner/private-a' : 'owner/private-b';
    const installationId = name === 'alice' ? 91 : 92;
    await saveAnalysis({ id, installationId, createdAt: new Date().toISOString(), pullRequest: { repository }, findings: [{ title: 'Fixture finding' }] });
    await enqueueReviewJob({ id, payload: { githubToken: 'must-not-leak', options: { installationId, trigger: { repository } } } });
  }
  const server = app.listen(0, '127.0.0.1');
  await new Promise(resolve => server.once('listening', resolve));
  const base = `http://127.0.0.1:${server.address().port}/api/analyses`;
  const request = (path = '', name = 'alice', options = {}) => fetch(base + path, {
    ...options,
    headers: { Cookie: `prism_session=access-${name}`, Origin: process.env.APP_ORIGIN, 'Content-Type': 'application/json' }
  });
  try {
    assert.equal((await fetch(base)).status, 401);
    for (const name of ['alice', 'bob']) {
      const history = await request('', name);
      assert.equal(history.status, 200);
      assert.equal(history.headers.get('cache-control'), 'no-store');
      assert.deepEqual((await history.json()).map(report => report.id), [`private-access-${name}`]);
      assert.equal((await request(`/private-access-${name}`, name)).status, 200);
    }
    assert.equal((await request('/private-access-bob')).status, 404);
    assert.equal((await request('/private-access-bob/job')).status, 404);
    const feedback = { method: 'PUT', body: JSON.stringify({ verdict: 'useful', userId: '902' }) };
    assert.equal((await request('/private-access-bob/findings/0/feedback', 'alice', feedback)).status, 404);
    assert.equal((await findAnalysis('private-access-bob')).feedback, undefined);
    assert.equal((await request('/private-access-alice/findings/0/feedback', 'alice', feedback)).status, 200);
    const saved = await findAnalysis('private-access-alice');
    assert.equal(saved.feedback['0_901'].userId, '901');
    assert.equal(saved.feedback['0_902'], undefined);
    const job = await request('/private-access-alice/job');
    assert.equal(job.status, 200);
    assert.deepEqual(await job.json(), { id: 'private-access-alice', status: 'queued' });
    revoked = true;
    assert.deepEqual(await (await request()).json(), []);
    assert.equal((await request('/private-access-alice')).status, 404);
    assert.equal((await request('/private-access-alice/job')).status, 404);
    assert.equal((await request('/private-access-alice/findings/0/feedback', 'alice', feedback)).status, 404);
    assert.equal((await request('/private-access-bob', 'bob')).status, 200);
  } finally {
    await new Promise(resolve => server.close(resolve));
    keys.forEach((key, index) => { if (old[index] === undefined) delete process.env[key]; else process.env[key] = old[index]; });
  }
});

test('inline advisory reviews map validated AI findings to latest PR diff and deduplicate', async () => {
  const keys = ['GITHUB_POST_INLINE', 'GITHUB_APP_SLUG']; const old = keys.map(key => process.env[key]);
  process.env.GITHUB_POST_INLINE = 'true'; process.env.GITHUB_APP_SLUG = 'prism';
  let posted; let stale = false;
  const headSha = 'b'.repeat(40);
  const changedFiles = [{ path: 'math.js', additions: 1, deletions: 1, patch: '@@ -1 +1 @@\n-return sum / count;\n+return sum;' }];
  const report = { id: 'inline-test', installationId: 7, status: 'completed', aiStatus: 'completed', pullRequest: { url: 'https://github.com/demo/repo/pull/2', baseSha: 'a'.repeat(40), headSha, changedFiles },
    findings: [{ source: 'ai', title: 'Incorrect average', severity: 'medium', filePath: 'math.js', lineNumber: 1, lineSide: 'new', evidence: 'return sum;', explanation: 'Returns total instead of average.', suggestedFix: 'Divide by item count.' }, { source: 'rule', title: 'Do not post heuristics' }] };
  mock.method(globalThis, 'fetch', async (url, options) => {
    if (options.method === 'POST') { posted = JSON.parse(options.body); return Response.json({ id: 3 }); }
    if (String(url).includes('/reviews?')) return Response.json(posted ? [{ body: posted.body, user: { login: 'prism[bot]' } }] : []);
    return Response.json({ head: { sha: stale ? 'c'.repeat(40) : headSha }, state: 'open' });
  });
  const getToken = async () => 'bot-token';
  try {
    assert.equal((await github.postInlineReview(report, { getToken, getPullRequest: async () => ({ ...report.pullRequest, changedFiles }) })).status, 'posted');
    assert.equal(posted.event, 'COMMENT'); assert.equal(posted.commit_id, headSha);
    assert.equal(posted.comments.length, 1); assert.equal(posted.comments[0].side, 'RIGHT');
    assert.equal((await github.postInlineReview(report, { getToken })).status, 'existing');
    posted = null; stale = true;
    assert.equal((await github.postInlineReview(report, { getToken })).errorCode, 'STALE_REVISION');
    assert.equal(posted, null);
  } finally { keys.forEach((key, index) => { if (old[index] === undefined) delete process.env[key]; else process.env[key] = old[index]; }); }
});

test('GitHub commit status is advisory and unavailable AI never turns green', async () => {
  const previous = process.env.GITHUB_POST_STATUS; process.env.GITHUB_POST_STATUS = 'true';
  const origin = process.env.APP_ORIGIN; process.env.APP_ORIGIN = 'https://demo.example';
  const states = [];
  mock.method(globalThis, 'fetch', async (_url, options) => { states.push(JSON.parse(options.body)); return Response.json({}); });
  const report = { id: 'status-test', installationId: 7, aiStatus: 'unavailable', pullRequest: { url: 'https://github.com/demo/repo/pull/2', headSha: 'b'.repeat(40) } };
  try {
    assert.equal((await github.postReviewStatus(report, { getToken: async () => 'bot-token' })).status, 'posted');
    assert.equal(states[0].state, 'error'); assert.equal(states[0].context, 'prism-ai/review');
    await github.postReviewStatus({ ...report, aiStatus: 'completed' }, { getToken: async () => 'bot-token' });
    assert.equal(states[1].state, 'success'); assert.match(states[1].description, /advisory/i);
  } finally { if (previous === undefined) delete process.env.GITHUB_POST_STATUS; else process.env.GITHUB_POST_STATUS = previous; if (origin === undefined) delete process.env.APP_ORIGIN; else process.env.APP_ORIGIN = origin; }
});

test('a concurrent inline duplicate cannot release the first publisher lock', async () => {
  const old = process.env.GITHUB_POST_INLINE; process.env.GITHUB_POST_INLINE = 'true';
  let release; let calls = 0;
  const blocked = new Promise(resolve => { release = resolve; });
  const report = { id: 'inline-concurrent', installationId: 7, aiStatus: 'completed', pullRequest: { url: 'https://github.com/demo/repo/pull/9', headSha: 'd'.repeat(40) } };
  mock.method(globalThis, 'fetch', async () => Response.json({ state: 'closed' }));
  const getToken = async () => { calls++; await blocked; return 'token'; };
  const first = github.postInlineReview(report, { getToken });
  try {
    await github.postInlineReview(report, { getToken });
    const third = github.postInlineReview(report, { getToken });
    assert.equal(calls, 1);
    release(); await third; await first;
  } finally { release(); if (old === undefined) delete process.env.GITHUB_POST_INLINE; else process.env.GITHUB_POST_INLINE = old; }
});

test('inline feedback bounds unique findings and omits malformed or unmappable evidence', async () => {
  const old = process.env.GITHUB_POST_INLINE; process.env.GITHUB_POST_INLINE = 'true';
  const headSha = 'e'.repeat(40); let posted;
  const lines = Array.from({ length: 6 }, (_, index) => `const result${index} = ${index};`);
  const pullRequest = { url: 'https://github.com/demo/repo/pull/7', headSha, changedFiles: [{ path: 'math.js', additions: 6, deletions: 0, patch: '@@ -0,0 +1,6 @@\n' + lines.map(line => '+' + line).join('\n') }] };
  const findings = lines.map((evidence, index) => ({ source: 'ai', title: 'Potential calculation issue', severity: 'medium', filePath: 'math.js', lineNumber: index + 1, evidence, explanation: 'Check the calculation.', suggestedFix: 'Confirm expected result.' }));
  mock.method(globalThis, 'fetch', async (url, options) => {
    if (options.method === 'POST') { posted = JSON.parse(options.body); return Response.json({}); }
    return Response.json(String(url).includes('/reviews?') ? [] : { state: 'open', head: { sha: headSha } });
  });
  try {
    const result = await github.postInlineReview({ id: 'inline-bounded', installationId: 7, aiStatus: 'completed', pullRequest, findings: [findings[0], findings[0], { ...findings[1], lineNumber: 100 }, ...findings.slice(1)] }, { getToken: async () => 'token', getPullRequest: async () => pullRequest });
    assert.equal(result.status, 'posted'); assert.equal(posted.comments.length, 5);
    assert.equal(new Set(posted.comments.map(comment => comment.line)).size, 5);
  } finally { if (old === undefined) delete process.env.GITHUB_POST_INLINE; else process.env.GITHUB_POST_INLINE = old; }
});

test('persistent authentication encrypts payloads and consumes browser state once', async () => {
  const { sealAuthData, openAuthData, writeAuthRecord, readAuthRecord } = await import('../src/features/pullRequest/github.repository.js');
  const previous = process.env.SESSION_ENCRYPTION_KEY;
  process.env.SESSION_ENCRYPTION_KEY = Buffer.alloc(32, 7).toString('base64');
  try {
    const sealed = sealAuthData({ token: 'private-user-token' });
    assert.ok(!sealed.includes('private-user-token'));
    assert.deepEqual(openAuthData(sealed), { token: 'private-user-token' });
    assert.throws(() => openAuthData(sealed.slice(0, -4) + 'AAAA'));
    await writeAuthRecord('oauth', 'test-state', { verifier: 'pkce-value' }, Date.now() + 5000);
    assert.equal((await readAuthRecord('oauth', 'test-state', true)).verifier, 'pkce-value');
    assert.equal(await readAuthRecord('oauth', 'test-state', true), null);
    await writeAuthRecord('session', 'expired-test', { token: 'expired' }, Date.now() - 1);
    assert.equal(await readAuthRecord('session', 'expired-test'), null);
  } finally { if (previous === undefined) delete process.env.SESSION_ENCRYPTION_KEY; else process.env.SESSION_ENCRYPTION_KEY = previous; }
});

test('review counters enforce an atomic allowance and fail closed in production without storage', async () => {
  const { incrementReviewCounter, readAuthRecord } = await import('../src/features/pullRequest/github.repository.js');
  assert.equal(await incrementReviewCounter('test-budget', 1, Date.now() + 5000), true);
  assert.equal(await incrementReviewCounter('test-budget', 1, Date.now() + 5000), false);
  const previous = process.env.NODE_ENV; process.env.NODE_ENV = 'production';
  try { await assert.rejects(readAuthRecord('session', 'anything'), /Session storage unavailable/); }
  finally { if (previous === undefined) delete process.env.NODE_ENV; else process.env.NODE_ENV = previous; }
});

test('email opt-in uses a verified GitHub address and revocation or opt-out prevents delivery', async () => {
  const { writeAuthRecord } = await import('../src/features/pullRequest/github.repository.js');
  const keys = ['GITHUB_APP_ID', 'APP_ORIGIN', 'EMAIL_ENABLED']; const previous = keys.map(key => process.env[key]);
  [process.env.GITHUB_APP_ID, process.env.APP_ORIGIN, process.env.EMAIL_ENABLED] = ['7', 'http://localhost:5173', 'true'];
  await writeAuthRecord('session', 'email-settings-test', { userId: '34', token: 'private-user-token' }, Date.now() + 60000);
  const realFetch = globalThis.fetch; let revoked = false;
  mock.method(globalThis, 'fetch', async (url, options) => {
    if (String(url).startsWith('http://127.0.0.1')) return realFetch(url, options);
    if (String(url).includes('/user/emails')) return Response.json([{ email: 'verified@example.com', primary: true, verified: true }]);
    if (String(url).includes('/repositories?')) return Response.json({ repositories: [{ full_name: 'owner/repo' }] });
    return Response.json({ installations: revoked ? [] : [{ id: 9, app_id: 7 }] });
  });
  const service = express(); service.use(express.json()); service.use('/github', github.createGitHubRoutes());
  const server = service.listen(0, '127.0.0.1'); await new Promise(resolve => server.once('listening', resolve));
  const base = 'http://127.0.0.1:' + server.address().port;
  const report = { installationId: 9, pullRequest: { repository: 'owner/repo' } };
  const settings = enabled => fetch(base + '/github/notifications/email', { method: 'PUT', headers: { 'Content-Type': 'application/json', Origin: process.env.APP_ORIGIN, Cookie: 'prism_session=email-settings-test' }, body: JSON.stringify({ enabled, email: 'untrusted@example.com' }) });
  try {
    assert.equal(await github.notificationRecipient('34', report), null);
    assert.equal((await settings(true)).status, 200);
    assert.equal(await github.notificationRecipient('34', report), 'verified@example.com');
    revoked = true; assert.equal(await github.notificationRecipient('34', report), null);
    revoked = false; assert.equal((await settings(false)).status, 200);
    assert.equal(await github.notificationRecipient('34', report), null);
    assert.equal((await settings(true)).status, 200);
    const afterSessionExpiry = Date.now() + 61000;
    mock.method(Date, 'now', () => afterSessionExpiry);
    assert.equal(await github.notificationRecipient('34', report), null, 'Derived mail authorization must end with the browser session');
  } finally { await new Promise(resolve => server.close(resolve)); keys.forEach((key, index) => { if (previous[index] === undefined) delete process.env[key]; else process.env[key] = previous[index]; }); }
});

test('installation access is checked against both installation and repository', () => {
  const auth = { repositories: [{ installationId: 7, repository: 'owner/repo' }] };
  assert.equal(github.canReadReport(auth, { installationId: 7, pullRequest: { repository: 'owner/repo' } }), true);
  assert.equal(github.canReadReport(auth, { installationId: 8, pullRequest: { repository: 'owner/repo' } }), false);
  assert.equal(github.canReadReport(auth, { pullRequest: { repository: 'owner/repo' } }), false);
});

test('installation token uses a signed short-lived App JWT and one repository with read permissions', async () => {
  const keys = ['GITHUB_APP_ID', 'GITHUB_APP_PRIVATE_KEY', 'GITHUB_POST_REVIEW', 'GITHUB_POST_STATUS'];
  const old = keys.map(key => process.env[key]);
  const { privateKey, publicKey } = generateKeyPairSync('rsa', { modulusLength: 2048 });
  process.env.GITHUB_APP_ID = '7';
  process.env.GITHUB_APP_PRIVATE_KEY = privateKey.export({ format: 'pem', type: 'pkcs8' }).toString();
  delete process.env.GITHUB_POST_REVIEW;
  mock.method(globalThis, 'fetch', async (url, options) => {
    assert.equal(url, 'https://api.github.com/app/installations/9/access_tokens');
    const jwt = options.headers.Authorization.slice(7).split('.');
    assert.equal(verify('RSA-SHA256', Buffer.from(jwt.slice(0, 2).join('.')), publicKey, Buffer.from(jwt[2], 'base64url')), true);
    const claims = JSON.parse(Buffer.from(jwt[1], 'base64url'));
    assert.equal(claims.iss, '7');
    assert.ok(claims.exp - claims.iat <= 600);
    assert.deepEqual(JSON.parse(options.body), { repositories: ['repo'], permissions: { contents: 'read', pull_requests: 'read' } });
    return Response.json({ token: 'installation-only-test-token' });
  });
  try {
    assert.equal(await github.installationToken(9, 'owner/repo'), 'installation-only-test-token');
    process.env.GITHUB_POST_STATUS = 'true';
    assert.equal(await github.installationToken(9, 'owner/repo'), 'installation-only-test-token', 'Optional status settings must not expand core retrieval permissions');
  }
  finally { keys.forEach((key, index) => { if (old[index] === undefined) delete process.env[key]; else process.env[key] = old[index]; }); }
});

test('repository discovery rejects invalid/revoked tokens with safe errors', async () => {
  mock.method(globalThis, 'fetch', async () => Response.json({ message: 'secret upstream text' }, { status: 401 }));
  await assert.rejects(github.userRepositories('test-token'), error => !error.message.includes('secret') && error.statusCode === 401);
});

test('other installed GitHub Apps do not consume the PRism installation limit', async () => {
  const previous = process.env.GITHUB_APP_ID; process.env.GITHUB_APP_ID = '7';
  mock.method(globalThis, 'fetch', async url => Response.json(String(url).includes('/repositories?')
    ? { repositories: [{ full_name: 'owner/repo' }] }
    : { installations: [...Array.from({ length: 6 }, (_, id) => ({ id, app_id: 99 })), { id: 20, app_id: 7 }] }));
  try { assert.deepEqual(await github.userRepositories('test-token'), [{ installationId: 20, repository: 'owner/repo' }]); }
  finally { if (previous === undefined) delete process.env.GITHUB_APP_ID; else process.env.GITHUB_APP_ID = previous; }
});

test('malformed GitHub authorization responses never expose upstream body fragments', async () => {
  mock.method(globalThis, 'fetch', async () => new Response('private-upstream-value', { status: 200 }));
  await assert.rejects(github.userRepositories('test-token'), error => error.statusCode === 502 && !error.message.includes('private'));
});

test('optional GitHub summary deduplicates a revision and preserves honest AI failure wording', async () => {
  const old = [process.env.GITHUB_POST_REVIEW, process.env.APP_ORIGIN, process.env.GITHUB_APP_SLUG];
  process.env.GITHUB_POST_REVIEW = 'true'; process.env.APP_ORIGIN = 'https://demo.example'; process.env.GITHUB_APP_SLUG = 'prism';
  let posted;
  mock.method(globalThis, 'fetch', async (_url, options) => {
    if (options.method === 'POST') { posted = JSON.parse(options.body).body; return Response.json({}); }
    return Response.json(posted ? [{ body: posted, user: { login: 'prism[bot]' } }] : []);
  });
  const report = { id: 'summary-test', installationId: 7, status: 'completed', aiStatus: 'unavailable', findings: [], pullRequest: { url: 'https://github.com/demo/repo/pull/2', baseSha: 'a'.repeat(40), headSha: 'b'.repeat(40) } };
  const getToken = mock.fn(async (id, repository) => { assert.equal(id, 7); assert.equal(repository, 'demo/repo'); return 'bot-installation-token'; });
  try {
    assert.equal((await github.postReviewSummary(report, { getToken })).status, 'posted');
    assert.equal(getToken.mock.callCount(), 1, 'Manual reviews must mint bot credentials rather than reuse a human token');
    assert.match(posted, /AI review unavailable/);
    assert.equal((await github.postReviewSummary(report, { getToken })).status, 'existing');
    assert.ok(globalThis.fetch.mock.calls.every(call => call.arguments[1].headers.Authorization === 'Bearer bot-installation-token'));
    assert.equal(globalThis.fetch.mock.calls.filter(call => call.arguments[1].method === 'POST').length, 1);
  } finally {
    ['GITHUB_POST_REVIEW', 'APP_ORIGIN', 'GITHUB_APP_SLUG'].forEach((key, index) => { if (old[index] === undefined) delete process.env[key]; else process.env[key] = old[index]; });
  }
});

test('public mode fails closed without App config and never serves HTML for unknown API routes', async () => {
  const previous = process.env.NODE_ENV;
  process.env.NODE_ENV = 'production';
  const server = app.listen(0, '127.0.0.1');
  await new Promise(resolve => server.once('listening', resolve));
  const base = `http://127.0.0.1:${server.address().port}`;
  try {
    assert.equal((await fetch(base + '/api/analyses')).status, 503);
    const response = await fetch(base + '/api/unknown');
    assert.match(response.headers.get('content-type'), /application\/json/);
    assert.equal(response.status, 404);
  } finally {
    await new Promise(resolve => server.close(resolve));
    if (previous === undefined) delete process.env.NODE_ENV; else process.env.NODE_ENV = previous;
  }
});

test('demo-only deployment serves one captured fixture while private report and generation routes stay closed', async () => {
  const previous = [process.env.NODE_ENV, process.env.DEMO_ONLY];
  process.env.NODE_ENV = 'production'; process.env.DEMO_ONLY = 'true';
  const server = app.listen(0, '127.0.0.1');
  await new Promise(resolve => server.once('listening', resolve));
  const base = `http://127.0.0.1:${server.address().port}`;
  try {
    const response = await fetch(base + '/api/demo/report');
    assert.equal(response.status, 200);
    const sample = await response.json();
    assert.equal(sample.sample.fixtureId, 'B01');
    assert.ok(sample.findings.length > 0);
    assert.match(sample.pullRequest.changedFiles[0].patch, /db.deleteNote/);
    assert.equal((await fetch(base + '/api/analyses')).status, 503);
    assert.equal((await fetch(base + '/api/analyses', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ pullRequestUrl: 'https://github.com/demo/repo/pull/1' }) })).status, 503);
    assert.equal((await fetch(base + '/api/demo/report/other')).status, 404);
    const session = await (await fetch(base + '/api/github/session')).json();
    assert.equal(session.demoOnly, true);
  } finally {
    await new Promise(resolve => server.close(resolve));
    ['NODE_ENV', 'DEMO_ONLY'].forEach((key, index) => { if (previous[index] === undefined) delete process.env[key]; else process.env[key] = previous[index]; });
  }
});

test('OAuth binds state to a browser, sends PKCE, hides tokens and blocks cross-origin writes', async () => {
  const { writeAuthRecord, readAuthRecord } = await import('../src/features/pullRequest/github.repository.js');
  await writeAuthRecord('session', 'previous-browser-session', { userId: '85', token: 'old-token' }, Date.now() + 60000);
  await writeAuthRecord('mail-token', '85', { token: 'old-token' }, Date.now() + 60000);
  await writeAuthRecord('email-preference', '85', { enabled: true }, Date.now() + 60000);
  const keys = ['GITHUB_APP_ID', 'GITHUB_APP_CLIENT_ID', 'GITHUB_APP_CLIENT_SECRET', 'APP_ORIGIN'];
  const old = keys.map(key => process.env[key]);
  keys.forEach((key, index) => { process.env[key] = ['7', 'client', 'secret', 'http://localhost:5173'][index]; });
  const realFetch = globalThis.fetch;
  const outbound = [];
  mock.method(globalThis, 'fetch', async (url, options) => {
    if (String(url).startsWith('http://127.0.0.1')) return realFetch(url, options);
    outbound.push([String(url), options]);
    if (String(url).includes('access_token')) return Response.json({ access_token: 'private-provider-token' });
    if (String(url).endsWith('/user')) return Response.json({ id: 12, login: 'demo' });
    return Response.json({ installations: [] });
  });
  const app = express();
  app.use('/github', github.createGitHubRoutes());
  app.post('/protected', github.requireSession, (req, res) => res.json({ ok: true }));
  const server = app.listen(0, '127.0.0.1');
  await new Promise(resolve => server.once('listening', resolve));
  const base = `http://127.0.0.1:${server.address().port}`;
  try {
    const login = await fetch(base + '/github/login', { redirect: 'manual' });
    const destination = new URL(login.headers.get('location'));
    assert.equal(destination.searchParams.get('code_challenge_method'), 'S256');
    const state = destination.searchParams.get('state');
    const callbackUrl = base + '/github/callback?state=' + state + '&code=test';
    assert.equal((await fetch(callbackUrl)).status, 400);
    const callback = await fetch(callbackUrl, { redirect: 'manual', headers: { Cookie: 'prism_state=' + state + '; prism_session=previous-browser-session' } });
    assert.equal(callback.status, 302);
    assert.equal(callback.headers.get('location'), process.env.APP_ORIGIN + '/app');
    assert.equal(await readAuthRecord('session', 'previous-browser-session'), null);
    assert.equal(await readAuthRecord('mail-token', '85'), null, 'replacing a browser session revokes its derived email authorization');
    assert.equal((await readAuthRecord('email-preference', '85')).enabled, true, 're-login preserves the saved opt-in preference');
    assert.equal(await readAuthRecord('mail-token', '12'), null, 'a different account must opt in independently');
    assert.ok(JSON.parse(outbound[0][1].body).code_verifier);
    const sessionCookie = callback.headers.getSetCookie().find(value => value.startsWith('prism_session='));
    assert.ok(sessionCookie.includes('HttpOnly'));
    assert.ok(!sessionCookie.includes('private-provider-token'));
    assert.equal((await fetch(callbackUrl, { headers: { Cookie: 'prism_state=' + state } })).status, 400);
    assert.equal((await fetch(base + '/protected', { method: 'POST', headers: { Cookie: sessionCookie.split(';')[0], Origin: 'https://evil.test' } })).status, 403);
  } finally {
    await new Promise(resolve => server.close(resolve));
    keys.forEach((key, index) => { if (old[index] === undefined) delete process.env[key]; else process.env[key] = old[index]; });
  }
});

test('post-install setup starts browser-bound OAuth without trusting installation IDs or redirect targets', async () => {
  const keys = ['GITHUB_APP_ID', 'GITHUB_APP_SLUG', 'GITHUB_APP_CLIENT_ID', 'GITHUB_APP_CLIENT_SECRET', 'APP_ORIGIN'];
  const old = keys.map(key => process.env[key]);
  keys.forEach((key, index) => { process.env[key] = ['7', 'prism', 'client', 'secret', 'http://localhost:5173'][index]; });
  const { readAuthRecord } = await import('../src/features/pullRequest/github.repository.js');
  const server = app.listen(0, '127.0.0.1');
  await new Promise(resolve => server.once('listening', resolve));
  const base = `http://127.0.0.1:${server.address().port}`;
  try {
    for (const query of ['installation_id=999999&setup_action=install', 'installation_id=999999']) {
      const legacy = await fetch(base + '/?' + query, { redirect: 'manual' });
      assert.equal(legacy.status, 302);
      assert.equal(legacy.headers.get('location'), '/api/github/setup');
    }
    const setup = await fetch(base + '/api/github/setup?installation_id=999999&returnTo=https://evil.example', { redirect: 'manual' });
    assert.equal(setup.status, 302);
    assert.equal(setup.headers.get('location'), '/api/github/login');
    for (const target of ['/analyses/report-1', 'https://evil.example', '//evil.example', '/api/github/logout']) {
      const login = await fetch(base + '/api/github/login?returnTo=' + encodeURIComponent(target), { redirect: 'manual' });
      const destination = new URL(login.headers.get('location'));
      assert.equal(destination.origin, 'https://github.com');
      assert.equal(destination.searchParams.get('code_challenge_method'), 'S256');
      const state = destination.searchParams.get('state');
      const stored = await readAuthRecord('oauth', state);
      assert.equal(stored.returnTo, target === '/analyses/report-1' ? target : '/app');
      assert.equal(stored.installationId, undefined, 'Query parameters must not grant repository access');
    }
    assert.equal((await fetch(base + '/api/github/callback?code=unsolicited-install-code', { redirect: 'manual' })).status, 400);
  } finally {
    await new Promise(resolve => server.close(resolve));
    keys.forEach((key, index) => { if (old[index] === undefined) delete process.env[key]; else process.env[key] = old[index]; });
  }
});

test('session separates account connection, accessible repositories and unavailable email delivery', async () => {
  const { writeAuthRecord } = await import('../src/features/pullRequest/github.repository.js');
  const keys = ['GITHUB_APP_ID', 'GITHUB_APP_SLUG', 'EMAIL_ENABLED']; const old = keys.map(key => process.env[key]);
  process.env.GITHUB_APP_ID = '7'; process.env.GITHUB_APP_SLUG = 'prism'; delete process.env.EMAIL_ENABLED;
  await writeAuthRecord('session', 'setup-session', { userId: '1004', login: 'second-user', token: 'fixture-second-user' }, Date.now() + 60000);
  const realFetch = globalThis.fetch; let revoked = false;
  mock.method(globalThis, 'fetch', async (url, options) => {
    if (String(url).startsWith('http://127.0.0.1')) return realFetch(url, options);
    assert.equal(options.headers.Authorization, 'Bearer fixture-second-user');
    return Response.json(String(url).includes('/repositories?') ? { repositories: [{ full_name: 'second/repo' }] }
      : { installations: revoked ? [] : [{ id: 1004, app_id: 7 }] });
  });
  const service = express(); service.use('/github', github.createGitHubRoutes());
  const server = service.listen(0, '127.0.0.1'); await new Promise(resolve => server.once('listening', resolve));
  const url = `http://127.0.0.1:${server.address().port}/github/session`;
  try {
    const guest = await (await fetch(url)).json();
    assert.equal(guest.repositoryCount, null);
    const connected = await (await fetch(url, { headers: { Cookie: 'prism_session=setup-session' } })).json();
    assert.equal(connected.authenticated, true);
    assert.equal(connected.repositoryCount, 1);
    assert.equal(connected.emailAvailable, false);
    assert.match(connected.emailUnavailableReason, /not configured/i);
    assert.equal(connected.installUrl, 'https://github.com/apps/prism/installations/new');
    assert.ok(!JSON.stringify(connected).includes('fixture-second-user'));
    revoked = true;
    const missing = await (await fetch(url, { headers: { Cookie: 'prism_session=setup-session' } })).json();
    assert.equal(missing.repositoryCount, 0);
    assert.equal(missing.authenticated, true, 'Account authorization and App installation are separate');
  } finally {
    await new Promise(resolve => server.close(resolve));
    keys.forEach((key, index) => { if (old[index] === undefined) delete process.env[key]; else process.env[key] = old[index]; });
  }
});

test('email permission denial explains reauthorization rather than blaming session storage', async () => {
  const { writeAuthRecord } = await import('../src/features/pullRequest/github.repository.js');
  const keys = ['GITHUB_APP_ID', 'APP_ORIGIN', 'EMAIL_ENABLED']; const old = keys.map(key => process.env[key]);
  process.env.GITHUB_APP_ID = '7'; process.env.APP_ORIGIN = 'http://localhost:5173'; process.env.EMAIL_ENABLED = 'true';
  await writeAuthRecord('session', 'email-denied-session', { userId: '1005', token: 'fixture-email-denied' }, Date.now() + 60000);
  const realFetch = globalThis.fetch; let emailStatus = 403; let emailRateLimited = false;
  mock.method(globalThis, 'fetch', async (url, options) => {
    if (String(url).startsWith('http://127.0.0.1')) return realFetch(url, options);
    if (String(url).includes('/user/emails')) return Response.json({ message: 'private upstream body' }, { status: emailStatus, headers: emailRateLimited ? { 'x-ratelimit-remaining': '0' } : {} });
    return Response.json({ installations: [] });
  });
  const service = express(); service.use(express.json()); service.use('/github', github.createGitHubRoutes());
  const server = service.listen(0, '127.0.0.1'); await new Promise(resolve => server.once('listening', resolve));
  try {
    for (const [status, limited] of [[403, false], [429, false], [503, false], [401, false], [403, true]]) {
      emailStatus = status; emailRateLimited = limited;
      const res = await fetch(`http://127.0.0.1:${server.address().port}/github/notifications/email`, { method: 'PUT',
        headers: { Cookie: 'prism_session=email-denied-session', Origin: process.env.APP_ORIGIN, 'Content-Type': 'application/json' }, body: JSON.stringify({ enabled: true }) });
      const permissionDenied = status === 403 && !limited;
      assert.equal(res.status, permissionDenied ? 403 : status === 401 ? 401 : 502);
      const body = await res.json();
      if (permissionDenied) assert.equal(body.errorCode, 'EMAIL_PERMISSION_REQUIRED');
      else assert.notEqual(body.errorCode, 'EMAIL_PERMISSION_REQUIRED');
      assert.match(body.message, permissionDenied || status === 401 ? /reconnect/i : /temporarily unavailable/i);
      assert.ok(!JSON.stringify(body).includes('private upstream'));
    }
  } finally {
    await new Promise(resolve => server.close(resolve));
    keys.forEach((key, index) => { if (old[index] === undefined) delete process.env[key]; else process.env[key] = old[index]; });
  }
});
