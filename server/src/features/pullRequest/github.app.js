import { createHash, randomBytes, sign } from 'node:crypto';
import { Router } from 'express';

const sessions = new Map();
const pending = new Map();
const reviewCounts = new Map();
const posting = new Set();
const appMode = () => Boolean(process.env.GITHUB_APP_ID);
const failure = (statusCode, message) => Object.assign(new Error(message), { statusCode });
const cookie = (request, name) => request.headers.cookie?.split(';').map(value => value.trim()).find(value => value.startsWith(name + '='))?.slice(name.length + 1);
const secure = () => process.env.NODE_ENV === 'production' ? '; Secure' : '';
const setCookie = (response, name, value, seconds) => response.append('Set-Cookie', `${name}=${value}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${seconds}${secure()}`);
const prune = map => { for (const [id, item] of map) if (item.expires <= Date.now()) map.delete(id); };

function consumeReviewBudget(key) {
  if (!appMode()) return true;
  prune(reviewCounts);
  const total = reviewCounts.get('total') || { count: 0, expires: Date.now() + 3600000 };
  const actor = reviewCounts.get(key) || { count: 0, expires: Date.now() + 3600000 };
  if (total.count >= 30 || actor.count >= 6) return false;
  total.count++; actor.count++;
  reviewCounts.set('total', total); reviewCounts.set(key, actor);
  return true;
}

async function githubRequest(path, token, body) {
  let response;
  try {
    response = await fetch('https://api.github.com' + path, {
      method: body ? 'POST' : 'GET', redirect: 'error', signal: AbortSignal.timeout(15000),
      headers: { Accept: 'application/vnd.github+json', Authorization: `Bearer ${token}`, 'User-Agent': 'prism-ai', ...(body ? { 'Content-Type': 'application/json' } : {}) },
      ...(body ? { body: JSON.stringify(body) } : {})
    });
  } catch { throw failure(502, 'GitHub access verification is unavailable.'); }
  if (!response.ok) throw failure(response.status === 401 ? 401 : 403, 'GitHub access could not be verified. Reconnect your account.');
  try { return await response.json(); }
  catch { throw failure(502, 'GitHub access verification returned an invalid response.'); }
}

async function userRepositories(token) {
  const repositories = [];
  // A bounded demo; do not silently grant access when pagination exceeds the cap.
  for (let page = 1; page <= 5; page++) {
    const result = await githubRequest(`/user/installations?per_page=100&page=${page}`, token);
    if (!Array.isArray(result.installations)) throw failure(502, 'Invalid GitHub installation response.');
    if (result.installations.length > 5) throw failure(413, 'Demo supports at most five accessible installations.');
    for (const installation of result.installations) {
      if (String(installation.app_id) !== String(process.env.GITHUB_APP_ID) || installation.suspended_at) continue;
      for (let repoPage = 1; repoPage <= 5; repoPage++) {
        const result = await githubRequest(`/user/installations/${installation.id}/repositories?per_page=100&page=${repoPage}`, token);
        if (!Array.isArray(result.repositories)) throw failure(502, 'Invalid GitHub repository response.');
        for (const repo of result.repositories) if (typeof repo.full_name === 'string') repositories.push({ installationId: installation.id, repository: repo.full_name.toLowerCase() });
        if (result.repositories.length < 100) break;
        if (repoPage === 5) throw failure(413, 'Demo repository access limit reached. Select fewer repositories.');
      }
    }
    if (result.installations.length < 100) return repositories;
  }
  throw failure(413, 'Demo installation limit reached.');
}

function canReadReport(auth, report) {
  if (!auth?.repositories) return !appMode() && process.env.NODE_ENV !== 'production';
  return auth.repositories.some(item => item.installationId === report.installationId && item.repository === report.pullRequest?.repository?.toLowerCase());
}

async function requireSession(request, response, next) {
  if (!appMode()) {
    if (process.env.NODE_ENV === 'production') return response.status(503).json({ message: 'Public access requires GitHub App configuration.' });
    return next();
  }
  prune(sessions);
  const session = sessions.get(cookie(request, 'prism_session'));
  if (!session) return response.status(401).json({ message: 'Connect GitHub to access your reports.' });
  if (!['GET', 'HEAD'].includes(request.method) && request.headers.origin !== process.env.APP_ORIGIN) return response.status(403).json({ message: 'Invalid request origin.' });
  try {
    // Recheck at the access boundary: uninstall, suspension and revoked repo access take effect immediately.
    request.auth = { ...session, repositories: await userRepositories(session.token) };
    next();
  } catch (error) { response.status(error.statusCode || 502).json({ message: error.message }); }
}

async function installationToken(installationId, repository) {
  if (!Number.isSafeInteger(installationId) || installationId < 1 || !/^[a-z\d-]+\/[\w.-]+$/i.test(repository)) throw failure(400, 'Invalid installation.');
  const now = Math.floor(Date.now() / 1000);
  const encode = value => Buffer.from(JSON.stringify(value)).toString('base64url');
  const unsigned = encode({ alg: 'RS256', typ: 'JWT' }) + '.' + encode({ iat: now - 60, exp: now + 540, iss: process.env.GITHUB_APP_ID });
  let jwt;
  try { jwt = unsigned + '.' + sign('RSA-SHA256', Buffer.from(unsigned), process.env.GITHUB_APP_PRIVATE_KEY?.replaceAll('\\n', '\n')).toString('base64url'); }
  catch { throw failure(503, 'GitHub App signing is not configured.'); }
  const result = await githubRequest(`/app/installations/${installationId}/access_tokens`, jwt, { repositories: [repository.split('/')[1]], permissions: { contents: 'read', pull_requests: process.env.GITHUB_POST_REVIEW === 'true' ? 'write' : 'read' } });
  if (typeof result.token !== 'string' || !result.token) throw failure(502, 'Installation access unavailable.');
  return result.token;
}

async function postReviewSummary(report, { getToken = installationToken } = {}) {
  if (process.env.GITHUB_POST_REVIEW !== 'true' || !report.installationId) return { status: 'skipped' };
  const match = report.pullRequest?.url?.match(/^https:\/\/github\.com\/([a-z\d-]+)\/([\w.-]+)\/pull\/([1-9]\d*)\/?$/i);
  if (!match || !report.pullRequest.baseSha || !report.pullRequest.headSha || !/^[a-z\d_-]{1,128}$/i.test(report.id)) return { status: 'unavailable', errorCode: 'INVALID_SCOPE' };
  const revision = createHash('sha256').update(`${report.installationId}:${match[1].toLowerCase()}/${match[2].toLowerCase()}:${report.pullRequest.baseSha}:${report.pullRequest.headSha}`).digest('hex');
  const marker = `<!-- prism-ai:${revision} -->`;
  if (posting.has(revision)) return { status: 'unavailable', errorCode: 'POST_IN_PROGRESS' };
  posting.add(revision);
  try {
    const origin = new URL(process.env.APP_ORIGIN);
    if (origin.origin !== process.env.APP_ORIGIN || !['https:', 'http:'].includes(origin.protocol)) throw Error('origin');
    // Manual reviews carry a human token; comments must always use the App bot identity.
    const token = await getToken(report.installationId, `${match[1]}/${match[2]}`);
    const path = `/repos/${match[1]}/${match[2]}/issues/${match[3]}/comments`;
    for (let page = 1; page <= 3; page++) {
      const comments = await githubRequest(`${path}?per_page=100&page=${page}`, token);
      if (!Array.isArray(comments)) throw Error('comments');
      if (comments.some(comment => comment.user?.login === `${process.env.GITHUB_APP_SLUG}[bot]` && typeof comment.body === 'string' && comment.body.includes(marker))) return { status: 'existing' };
      if (comments.length < 100) break;
      if (page === 3) return { status: 'unavailable', errorCode: 'COMMENT_SCAN_LIMIT' };
    }
    const status = report.aiStatus === 'completed' ? 'AI review completed' : report.aiStatus === 'partial' ? 'AI review partial' : 'AI review unavailable; deterministic analysis remains available';
    const body = `${marker}\n### PRism AI advisory review\n${status}.\n\n${report.findings.length} advisory finding(s). This is not merge approval.\n\n[Open the access-controlled report](${origin.origin}/analyses/${report.id})`;
    await githubRequest(path, token, { body });
    return { status: 'posted' };
  } catch { return { status: 'unavailable', errorCode: 'GITHUB_POST_FAILED' }; }
  finally { posting.delete(revision); }
}

function createGitHubRoutes() {
  const router = Router();
  router.get('/session', (request, response) => {
    prune(sessions);
    const session = sessions.get(cookie(request, 'prism_session'));
    const slug = process.env.GITHUB_APP_SLUG;
    response.set('Cache-Control', 'no-store').json({ enabled: appMode() || process.env.NODE_ENV === 'production', authenticated: Boolean(session), userId: session?.userId || null, login: session?.login || null, installUrl: /^[\w-]+$/.test(slug || '') ? `https://github.com/apps/${slug}/installations/new` : null });
  });
  router.get('/login', (request, response) => {
    if (!appMode() || !process.env.GITHUB_APP_CLIENT_ID || !process.env.GITHUB_APP_CLIENT_SECRET || !process.env.APP_ORIGIN) return response.status(503).json({ message: 'GitHub App login is not configured.' });
    prune(pending);
    if (pending.size >= 100) return response.status(429).json({ message: 'Please try signing in later.' });
    const state = randomBytes(32).toString('hex');
    const verifier = randomBytes(32).toString('base64url');
    pending.set(state, { verifier, expires: Date.now() + 600000 });
    setCookie(response, 'prism_state', state, 600);
    const params = new URLSearchParams({ client_id: process.env.GITHUB_APP_CLIENT_ID, redirect_uri: process.env.APP_ORIGIN + '/api/github/callback', state, code_challenge: createHash('sha256').update(verifier).digest('base64url'), code_challenge_method: 'S256' });
    response.redirect('https://github.com/login/oauth/authorize?' + params);
  });
  router.get('/callback', async (request, response) => {
    prune(pending);
    const state = request.query.state;
    const entry = typeof state === 'string' && pending.get(state);
    if (!entry || cookie(request, 'prism_state') !== state || typeof request.query.code !== 'string') return response.status(400).json({ message: 'Invalid or expired GitHub login. Start again.' });
    pending.delete(state);
    setCookie(response, 'prism_state', '', 0);
    try {
      const result = await fetch('https://github.com/login/oauth/access_token', { method: 'POST', redirect: 'error', signal: AbortSignal.timeout(15000), headers: { Accept: 'application/json', 'Content-Type': 'application/json' }, body: JSON.stringify({ client_id: process.env.GITHUB_APP_CLIENT_ID, client_secret: process.env.GITHUB_APP_CLIENT_SECRET, redirect_uri: process.env.APP_ORIGIN + '/api/github/callback', code: request.query.code, code_verifier: entry.verifier }) });
      if (!result.ok) throw Error('exchange');
      const data = await result.json();
      if (typeof data.access_token !== 'string' || data.error) throw Error('exchange');
      const user = await githubRequest('/user', data.access_token);
      if (!Number.isSafeInteger(user.id) || typeof user.login !== 'string') throw Error('user');
      prune(sessions);
      if (sessions.size >= 500) throw Error('capacity');
      sessions.delete(cookie(request, 'prism_session'));
      const id = randomBytes(32).toString('hex');
      const seconds = Math.min(Number.isFinite(data.expires_in) && data.expires_in > 0 ? data.expires_in : 3600, 28800);
      sessions.set(id, { token: data.access_token, userId: String(user.id), login: user.login, expires: Date.now() + seconds * 1000 });
      setCookie(response, 'prism_session', id, seconds);
      response.redirect(process.env.APP_ORIGIN + '/app');
    } catch { response.status(502).json({ message: 'GitHub login failed. Start again.' }); }
  });
  router.post('/logout', (request, response) => {
    if (request.headers.origin !== process.env.APP_ORIGIN) return response.status(403).json({ message: 'Invalid request origin.' });
    sessions.delete(cookie(request, 'prism_session'));
    setCookie(response, 'prism_session', '', 0);
    response.status(204).end();
  });
  return router;
}

export { appMode, requireSession, canReadReport, userRepositories, installationToken, createGitHubRoutes, consumeReviewBudget, postReviewSummary };
