import { createHash, randomBytes, sign } from 'node:crypto';
import { Router } from 'express';
import { writeAuthRecord, readAuthRecord, deleteAuthRecord, incrementReviewCounter } from './github.repository.js';
import { fetchPullRequest } from './pullRequest.service.js';
import { prepareAiInput, containsSensitiveText } from '../ai/ai.context.js';
import { validateFindings } from '../ai/ai.service.js';

const posting = new Set();
const appMode = () => Boolean(process.env.GITHUB_APP_ID);
const failure = (statusCode, message) => Object.assign(new Error(message), { statusCode });
const cookie = (request, name) => request.headers.cookie?.split(';').map(value => value.trim()).find(value => value.startsWith(name + '='))?.slice(name.length + 1);
const secure = () => process.env.NODE_ENV === 'production' ? '; Secure' : '';
const setCookie = (response, name, value, seconds) => response.append('Set-Cookie', `${name}=${value}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${seconds}${secure()}`);
async function consumeReviewBudget(key) {
  if (!appMode()) return true;
  const now = new Date();
  const hour = now.toISOString().slice(0, 13);
  const month = now.toISOString().slice(0, 7);
  const monthlyLimit = Number(process.env.REVIEW_MONTHLY_LIMIT || 100);
  if (!Number.isSafeInteger(monthlyLimit) || monthlyLimit < 1 || monthlyLimit > 10000) return false;
  return await incrementReviewCounter(`${key}:${hour}`, 6, Date.now() + 3600000)
    && await incrementReviewCounter(`total:${hour}`, 30, Date.now() + 3600000)
    && await incrementReviewCounter(`total:${month}`, monthlyLimit, Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + 1, 1));
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
  let matchingInstallations = 0;
  // A bounded demo; do not silently grant access when pagination exceeds the cap.
  for (let page = 1; page <= 5; page++) {
    const result = await githubRequest(`/user/installations?per_page=100&page=${page}`, token);
    if (!Array.isArray(result.installations)) throw failure(502, 'Invalid GitHub installation response.');
    for (const installation of result.installations) {
      if (String(installation.app_id) !== String(process.env.GITHUB_APP_ID) || installation.suspended_at) continue;
      if (++matchingInstallations > 5) throw failure(413, 'Demo supports at most five accessible PRism installations.');
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

async function verifiedEmail(token) {
  const emails = await githubRequest('/user/emails?per_page=100', token);
  if (!Array.isArray(emails)) throw failure(502, 'GitHub email verification is unavailable.');
  return emails.find(item => item.verified && item.primary)?.email || emails.find(item => item.verified)?.email || null;
}

async function notificationRecipient(userId, report) {
  if (!/^\d+$/.test(userId || '')) return null;
  const preference = await readAuthRecord('email-preference', userId);
  const session = await readAuthRecord('mail-token', userId);
  if (!preference?.enabled || !session?.token) return null;
  // Recheck repository access and verified address immediately before delivery.
  if (!canReadReport({ repositories: await userRepositories(session.token) }, report)) return null;
  return verifiedEmail(session.token);
}

async function requireSession(request, response, next) {
  if (process.env.DEMO_ONLY === 'true') return response.status(503).json({ message: 'This deployment serves a read-only demo.' });
  if (!appMode()) {
    if (process.env.NODE_ENV === 'production') return response.status(503).json({ message: 'Public access requires GitHub App configuration.' });
    return next();
  }
  let session;
  try { session = await readAuthRecord('session', cookie(request, 'prism_session')); }
  catch { return response.status(503).json({ message: 'GitHub session storage is unavailable.' }); }
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
  const result = await githubRequest(`/app/installations/${installationId}/access_tokens`, jwt, { repositories: [repository.split('/')[1]], permissions: {
    contents: 'read', pull_requests: process.env.GITHUB_POST_REVIEW === 'true' || process.env.GITHUB_POST_INLINE === 'true' || process.env.GITHUB_REVIEW_COMMANDS === 'true' ? 'write' : 'read',
    ...(process.env.GITHUB_POST_STATUS === 'true' ? { statuses: 'write' } : {}) } });
  if (typeof result.token !== 'string' || !result.token) throw failure(502, 'Installation access unavailable.');
  return result.token;
}

function reportScope(report) {
  const match = report.pullRequest?.url?.match(/^https:\/\/github\.com\/([a-z\d-]+)\/([\w.-]+)\/pull\/([1-9]\d*)\/?$/i);
  if (!match || !Number.isSafeInteger(report.installationId) || !/^[a-f\d]{40}$/i.test(report.pullRequest.headSha || '')
    || !/^[a-z\d_-]{1,128}$/i.test(report.id || '')) throw Error('Invalid report scope');
  return { repository: `${match[1]}/${match[2]}`, number: match[3], headSha: report.pullRequest.headSha };
}

const advisoryText = text => text.replaceAll('@', '@\u200b').replaceAll('<', '&lt;').replaceAll('>', '&gt;');

async function postInlineReview(report, { getToken = installationToken, getPullRequest = fetchPullRequest } = {}) {
  if (process.env.GITHUB_POST_INLINE !== 'true' || !report.installationId) return { status: 'skipped' };
  let key; let acquired = false;
  try {
    const { repository, number, headSha } = reportScope(report);
    key = `inline:${report.installationId}:${repository.toLowerCase()}:${number}:${headSha}`;
    if (posting.has(key)) return { status: 'unavailable', errorCode: 'POST_IN_PROGRESS' };
    posting.add(key);
    acquired = true;
    const token = await getToken(report.installationId, repository);
    const path = `/repos/${repository}/pulls/${number}`;
    const latest = await githubRequest(path, token);
    if (latest.state !== 'open' || latest.head?.sha !== headSha) return { status: 'unavailable', errorCode: 'STALE_REVISION' };
    const marker = `<!-- prism-inline:${createHash('sha256').update(key).digest('hex')} -->`;
    for (let page = 1; page <= 3; page++) {
      const reviews = await githubRequest(`${path}/reviews?per_page=100&page=${page}`, token);
      if (!Array.isArray(reviews)) throw Error('Invalid reviews');
      if (reviews.some(review => review.user?.login === `${process.env.GITHUB_APP_SLUG}[bot]` && review.body?.includes(marker))) return { status: 'existing' };
      if (reviews.length < 100) break;
      if (page === 3) return { status: 'unavailable', errorCode: 'REVIEW_SCAN_LIMIT' };
    }
    // Incremental old-side coordinates differ from the actual PR diff. Revalidate
    // against the current full PR; unmappable findings remain in the web report.
    const current = await getPullRequest(report.pullRequest.url, { token });
    if (current.headSha !== headSha) return { status: 'unavailable', errorCode: 'STALE_REVISION' };
    const candidates = report.findings.filter(item => item.source === 'ai');
    const findings = validateFindings(candidates, prepareAiInput(current).files)
      .filter(item => !containsSensitiveText([item.title, item.explanation, item.suggestedFix].join('\n'))).slice(0, 5);
    if (!findings.length) return { status: 'skipped' };
    const comments = findings.map(item => ({ path: item.filePath, line: item.lineNumber, side: item.lineSide === 'old' ? 'LEFT' : 'RIGHT',
      body: advisoryText(`**${item.severity}: ${item.title}**\n\n${item.explanation}\n\nSuggested action: ${item.suggestedFix}\n\nAdvisory AI finding; verify before changing code.`) }));
    await githubRequest(`${path}/reviews`, token, { event: 'COMMENT', commit_id: headSha, body: `${marker}\nPRism AI advisory findings. This is not merge approval.`, comments });
    return { status: 'posted' };
  } catch { return { status: 'unavailable', errorCode: 'INLINE_POST_FAILED' }; }
  finally { if (acquired) posting.delete(key); }
}

async function postReviewStatus(report, { getToken = installationToken, pending = false } = {}) {
  if (process.env.GITHUB_POST_STATUS !== 'true' || !report.installationId) return { status: 'skipped' };
  try {
    const { repository, headSha } = reportScope(report);
    const origin = new URL(process.env.APP_ORIGIN);
    if (origin.origin !== process.env.APP_ORIGIN || !['http:', 'https:'].includes(origin.protocol)) throw Error('Invalid origin');
    const token = await getToken(report.installationId, repository);
    const state = pending ? 'pending' : report.aiStatus === 'completed' ? 'success' : 'error';
    await githubRequest(`/repos/${repository}/statuses/${headSha}`, token, { state, context: 'prism-ai/review',
      description: pending ? 'Review in progress (advisory)' : state === 'success' ? 'AI review completed; advisory, not merge approval' : 'AI review incomplete or unavailable; inspect report',
      target_url: `${origin.origin}/analyses/${report.id}` });
    return { status: 'posted' };
  } catch { return { status: 'unavailable', errorCode: 'STATUS_POST_FAILED' }; }
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
  router.get('/session', async (request, response) => {
    const session = process.env.DEMO_ONLY === 'true' ? null : await readAuthRecord('session', cookie(request, 'prism_session'));
    const emailPreference = session ? await readAuthRecord('email-preference', session.userId) : null;
    const slug = process.env.GITHUB_APP_SLUG;
    const demoOnly = process.env.DEMO_ONLY === 'true';
    response.set('Cache-Control', 'no-store').json({ demoOnly, enabled: !demoOnly && (appMode() || process.env.NODE_ENV === 'production'), authenticated: !demoOnly && Boolean(session), userId: !demoOnly ? session?.userId || null : null, login: !demoOnly ? session?.login || null : null, emailAvailable: process.env.EMAIL_ENABLED === 'true', emailNotifications: Boolean(emailPreference?.enabled), installUrl: !demoOnly && /^[\w-]+$/.test(slug || '') ? `https://github.com/apps/${slug}/installations/new` : null });
  });
  router.get('/login', async (request, response) => {
    if (process.env.DEMO_ONLY === 'true') return response.status(503).json({ message: 'This deployment serves a read-only demo.' });
    if (!appMode() || !process.env.GITHUB_APP_CLIENT_ID || !process.env.GITHUB_APP_CLIENT_SECRET || !process.env.APP_ORIGIN) return response.status(503).json({ message: 'GitHub App login is not configured.' });
    if (!await incrementReviewCounter('login:' + new Date().toISOString().slice(0, 13), 100, Date.now() + 3600000)) return response.status(429).json({ message: 'Login allowance reached. Try again later.' });
    const state = randomBytes(32).toString('hex');
    const verifier = randomBytes(32).toString('base64url');
    await writeAuthRecord('oauth', state, { verifier }, Date.now() + 600000);
    setCookie(response, 'prism_state', state, 600);
    const params = new URLSearchParams({ client_id: process.env.GITHUB_APP_CLIENT_ID, redirect_uri: process.env.APP_ORIGIN + '/api/github/callback', state, code_challenge: createHash('sha256').update(verifier).digest('base64url'), code_challenge_method: 'S256' });
    response.redirect('https://github.com/login/oauth/authorize?' + params);
  });
  router.get('/callback', async (request, response) => {
    if (process.env.DEMO_ONLY === 'true') return response.status(503).json({ message: 'This deployment serves a read-only demo.' });
    const state = request.query.state;
    if (typeof state !== 'string' || cookie(request, 'prism_state') !== state || typeof request.query.code !== 'string') return response.status(400).json({ message: 'Invalid or expired GitHub login. Start again.' });
    const entry = await readAuthRecord('oauth', state, true);
    if (!entry) return response.status(400).json({ message: 'Invalid or expired GitHub login. Start again.' });
    setCookie(response, 'prism_state', '', 0);
    try {
      const result = await fetch('https://github.com/login/oauth/access_token', { method: 'POST', redirect: 'error', signal: AbortSignal.timeout(15000), headers: { Accept: 'application/json', 'Content-Type': 'application/json' }, body: JSON.stringify({ client_id: process.env.GITHUB_APP_CLIENT_ID, client_secret: process.env.GITHUB_APP_CLIENT_SECRET, redirect_uri: process.env.APP_ORIGIN + '/api/github/callback', code: request.query.code, code_verifier: entry.verifier }) });
      if (!result.ok) throw Error('exchange');
      const data = await result.json();
      if (typeof data.access_token !== 'string' || data.error) throw Error('exchange');
      const user = await githubRequest('/user', data.access_token);
      if (!Number.isSafeInteger(user.id) || typeof user.login !== 'string') throw Error('user');
      await deleteAuthRecord('session', cookie(request, 'prism_session'));
      const id = randomBytes(32).toString('hex');
      const seconds = Math.min(Number.isFinite(data.expires_in) && data.expires_in > 0 ? data.expires_in : 3600, 28800);
      await writeAuthRecord('session', id, { token: data.access_token, userId: String(user.id), login: user.login }, Date.now() + seconds * 1000);
      const preference = await readAuthRecord('email-preference', String(user.id));
      if (preference?.enabled) await writeAuthRecord('mail-token', String(user.id), { token: data.access_token }, Date.now() + seconds * 1000);
      setCookie(response, 'prism_session', id, seconds);
      response.redirect(process.env.APP_ORIGIN + '/app');
    } catch { response.status(502).json({ message: 'GitHub login failed. Start again.' }); }
  });
  router.post('/logout', async (request, response) => {
    if (request.headers.origin !== process.env.APP_ORIGIN) return response.status(403).json({ message: 'Invalid request origin.' });
    const session = await readAuthRecord('session', cookie(request, 'prism_session'));
    if (session) await deleteAuthRecord('mail-token', session.userId);
    await deleteAuthRecord('session', cookie(request, 'prism_session'));
    setCookie(response, 'prism_session', '', 0);
    response.status(204).end();
  });
  router.put('/notifications/email', requireSession, async (request, response) => {
    if (!request.auth) return response.status(401).json({ message: 'Connect GitHub first.' });
    const enabled = request.body?.enabled;
    if (typeof enabled !== 'boolean') return response.status(400).json({ message: 'Specify whether review emails are enabled.' });
    if (enabled) {
      if (process.env.EMAIL_ENABLED !== 'true') return response.status(503).json({ message: 'Email delivery is not configured.' });
      if (!await verifiedEmail(request.auth.token)) return response.status(400).json({ message: 'Add a verified email to GitHub before enabling notifications.' });
      // A derived authorization must never outlive the session that granted it.
      await writeAuthRecord('mail-token', request.auth.userId, { token: request.auth.token }, request.auth.expiresAt);
    } else await deleteAuthRecord('mail-token', request.auth.userId);
    await writeAuthRecord('email-preference', request.auth.userId, { enabled }, Date.now() + 31536000000);
    response.json({ enabled });
  });
  router.use((_error, request, response, next) => response.status(503).json({ message: 'GitHub session storage is unavailable.' }));
  return router;
}

export { appMode, requireSession, canReadReport, userRepositories, installationToken, createGitHubRoutes, consumeReviewBudget, postReviewSummary, notificationRecipient };
export { postInlineReview, postReviewStatus };
export { githubRequest };
