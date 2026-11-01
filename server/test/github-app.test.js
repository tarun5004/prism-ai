import assert from 'node:assert/strict';
import { afterEach, mock, test } from 'node:test';
import * as github from '../src/features/pullRequest/github.app.js';
import express from 'express';
import app from '../src/app.js';

afterEach(() => mock.restoreAll());

test('installation access is checked against both installation and repository', () => {
  const auth = { repositories: [{ installationId: 7, repository: 'owner/repo' }] };
  assert.equal(github.canReadReport(auth, { installationId: 7, pullRequest: { repository: 'owner/repo' } }), true);
  assert.equal(github.canReadReport(auth, { installationId: 8, pullRequest: { repository: 'owner/repo' } }), false);
  assert.equal(github.canReadReport(auth, { pullRequest: { repository: 'owner/repo' } }), false);
});

test('repository discovery rejects invalid/revoked tokens with safe errors', async () => {
  mock.method(globalThis, 'fetch', async () => Response.json({ message: 'secret upstream text' }, { status: 401 }));
  await assert.rejects(github.userRepositories('test-token'), error => !error.message.includes('secret') && error.statusCode === 401);
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
  try {
    assert.equal((await github.postReviewSummary(report, 'token')).status, 'posted');
    assert.match(posted, /AI review unavailable/);
    assert.equal((await github.postReviewSummary(report, 'token')).status, 'existing');
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
