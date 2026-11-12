import assert from 'node:assert/strict';
import { afterEach, mock, test } from 'node:test';
import * as github from '../src/features/pullRequest/github.app.js';
import express from 'express';
import { generateKeyPairSync, verify } from 'node:crypto';
import app from '../src/app.js';

afterEach(() => mock.restoreAll());

test('installation access is checked against both installation and repository', () => {
  const auth = { repositories: [{ installationId: 7, repository: 'owner/repo' }] };
  assert.equal(github.canReadReport(auth, { installationId: 7, pullRequest: { repository: 'owner/repo' } }), true);
  assert.equal(github.canReadReport(auth, { installationId: 8, pullRequest: { repository: 'owner/repo' } }), false);
  assert.equal(github.canReadReport(auth, { pullRequest: { repository: 'owner/repo' } }), false);
});

test('installation token uses a signed short-lived App JWT and one repository with read permissions', async () => {
  const keys = ['GITHUB_APP_ID', 'GITHUB_APP_PRIVATE_KEY', 'GITHUB_POST_REVIEW'];
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
  try { assert.equal(await github.installationToken(9, 'owner/repo'), 'installation-only-test-token'); }
  finally { keys.forEach((key, index) => { if (old[index] === undefined) delete process.env[key]; else process.env[key] = old[index]; }); }
});

test('repository discovery rejects invalid/revoked tokens with safe errors', async () => {
  mock.method(globalThis, 'fetch', async () => Response.json({ message: 'secret upstream text' }, { status: 401 }));
  await assert.rejects(github.userRepositories('test-token'), error => !error.message.includes('secret') && error.statusCode === 401);
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
    const callback = await fetch(callbackUrl, { redirect: 'manual', headers: { Cookie: 'prism_state=' + state } });
    assert.equal(callback.status, 302);
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
