// One explicit human decision permits one fixed GitHub summary, never arbitrary text.
import { createHash, randomUUID } from 'node:crypto';
import { canReadReport, githubRequest, installationToken } from '../pullRequest/github.app.js';
import { findAnalysis, claimPublication, finishPublication } from './analysis.repository.js';

const fail = (statusCode, message) => Object.assign(Error(message), { statusCode });

function publicationPreview(report, origin) {
  const url = new URL(origin);
  if (url.protocol !== 'https:' && !(process.env.NODE_ENV !== 'production' && url.protocol === 'http:' && ['localhost', '127.0.0.1'].includes(url.hostname))) throw Error('Configure APP_ORIGIN.');
  if (url.username || url.password || url.search || url.hash || !/^[a-z\d_-]{1,128}$/i.test(report.id)) throw Error('Invalid summary origin.');
  const marker = `<!-- prism-approved:${createHash('sha256').update(`${report.installationId}:${report.id}`).digest('hex')} -->`;
  const status = { completed: 'completed', partial: 'partial', unavailable: 'unavailable', skipped: 'skipped' }[report.aiStatus] || 'unknown';
  const provenance = report.aiDiagnostics?.agent?.provenance === 'live-provider' ? 'Live provider run.'
    : report.aiDiagnostics?.agent?.provenance === 'scripted-fixture' ? 'Scripted fixture; no live model inference.' : 'Provider execution was not verified.';
  return `${marker}\n### PRism AI advisory review\nAI review ${status}. ${report.findings.length} advisory finding(s). ${provenance}\n\nHuman-approved summary only. This is not merge approval.\n\n[Open the access-controlled report](${url.origin}/analyses/${report.id})`;
}

function initializePublication(report, origin = process.env.APP_ORIGIN) {
  try { return { status: 'pending', preview: publicationPreview(report, origin) }; }
  catch { return { status: 'pending', errorCode: 'PUBLICATION_CONFIGURATION' }; }
}

async function publishApprovedSummary(report, auth, decision, {
  request = githubRequest, getToken = installationToken, origin = process.env.APP_ORIGIN, appId = process.env.GITHUB_APP_ID,
} = {}) {
  if (!auth?.token || !/^\d+$/.test(auth.userId || '') || !auth.repositories?.some(item => item.installationId === report.installationId && item.repository === report.pullRequest?.repository)
    || !canReadReport(auth, report)) throw fail(404, 'Review not found.');
  if (!['approve', 'reject'].includes(decision) || !report.aiDiagnostics?.agent || !report.publication) throw fail(400, 'Agent review approval is unavailable.');
  const repository = report.pullRequest.repository;
  const match = report.pullRequest.url?.match(/^https:\/\/github\.com\/([^/]+\/[^/]+)\/pull\/([1-9]\d*)\/?$/);
  if (!match || match[1] !== repository || ![report.pullRequest.baseSha, report.pullRequest.headSha].every(sha => /^[a-f\d]{40}$/.test(sha || ''))) throw fail(409, 'Report revision is unavailable.');
  let body;
  try { body = publicationPreview(report, origin); } catch { throw fail(503, 'Summary publishing is not configured.'); }
  if (body !== report.publication.preview) throw fail(409, 'The saved preview differs from this deployment. A fresh review is required.');
  let permission, token;
  try {
    permission = await request(`/repos/${repository}`, auth.token);
    if (!['push', 'maintain', 'admin'].some(key => permission.permissions?.[key] === true)) throw fail(403, 'Repository write permission is required.');
    token = await getToken(report.installationId, repository, { writeReviews: true });
  } catch (error) { if (error.statusCode === 403) throw error; throw fail(503, 'Fresh GitHub authorization could not be verified.'); }
  const prPath = `/repos/${repository}/pulls/${match[2]}`;
  const comments = `/repos/${repository}/issues/${match[2]}/comments`;
  async function currentRevision() {
    let latest;
    try { latest = await request(prPath, token); } catch { throw fail(503, 'GitHub revision verification is unavailable.'); }
    if (latest.state !== 'open' || latest.base?.sha !== report.pullRequest.baseSha || latest.head?.sha !== report.pullRequest.headSha) throw fail(409, 'PR changed or closed. Analyze the current revision first.');
  }
  async function alreadyPosted() {
    const marker = body.split('\n')[0];
    for (let page = 1; page <= 3; page++) {
      const items = await request(`${comments}?per_page=100&page=${page}`, token);
      if (!Array.isArray(items)) throw Error('Invalid comments response.');
      const found = items.find(item => appId && String(item.performed_via_github_app?.id) === String(appId)
        && item.user?.type === 'Bot' && item.body?.includes(marker));
      if (found) return found;
      if (items.length < 100) return false;
    }
    throw Error('Comment scan limit reached.');
  }
  const latest = await findAnalysis(report.id);
  if (latest.publication.status === 'published') return latest;
  if (latest.publication.status === 'rejected') throw fail(409, 'This publication was rejected.');
  if (latest.publication.status === 'publishing' && Date.now() - new Date(latest.publication.updatedAt).getTime() < 180000) return latest;
  if (['unknown', 'publishing'].includes(latest.publication.status)) {
    // Read-only reconciliation: an uncertain external write is NEVER submitted again.
    let found = false;
    try { found = await alreadyPosted(); } catch { /* Remain uncertain. */ }
    return await finishPublication(report.id, latest.publication.owner, { status: found ? 'published' : 'unknown',
      ...(Number.isSafeInteger(found?.id) ? { commentId: found.id } : {}), errorCode: found ? null : 'PUBLICATION_UNCERTAIN' }) || await findAnalysis(report.id);
  }
  await currentRevision();
  const owner = randomUUID();
  const claimed = await claimPublication(report.id, decision, auth.userId, owner);
  if (!claimed || decision === 'reject') return await findAnalysis(report.id);
  let postStarted = false;
  try {
    let posted = await alreadyPosted();
    if (!posted) {
      await currentRevision(); // Check again immediately before the sole write.
      postStarted = true;
      posted = await request(comments, token, { body });
    }
    return await finishPublication(report.id, owner, { status: 'published', errorCode: null,
      ...(Number.isSafeInteger(posted?.id) ? { commentId: posted.id } : {}) }) || await findAnalysis(report.id);
  } catch {
    return await finishPublication(report.id, owner, { status: postStarted ? 'unknown' : 'pending',
      errorCode: postStarted ? 'PUBLICATION_UNCERTAIN' : 'PUBLICATION_PRECHECK_FAILED' }) || await findAnalysis(report.id);
  }
}

function createPublicationHandler({ publish = publishApprovedSummary } = {}) {
  return async (request, response) => {
    if (!request.body || Object.keys(request.body).length !== 1 || !['approve', 'reject'].includes(request.body.decision)) return response.status(400).json({ message: 'Use approve or reject only.' });
    const report = await findAnalysis(request.params.analysisId);
    if (!report) return response.status(404).json({ message: 'Review not found.' });
    try { response.json(await publish(report, request.auth, request.body.decision)); }
    catch (error) { response.status([400, 403, 404, 409, 503].includes(error.statusCode) ? error.statusCode : 503).json({ message: error.statusCode ? error.message : 'Summary publishing is unavailable. Check the saved status before retrying.' }); }
  };
}

export { initializePublication, publishApprovedSummary, createPublicationHandler };
