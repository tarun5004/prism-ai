import { createHash, createHmac, timingSafeEqual } from 'node:crypto';
import { analyzePullRequest } from '../analysis/analysis.service.js';
import { findAnalysis } from '../analysis/analysis.repository.js';
import { appMode, installationToken, consumeReviewBudget } from './github.app.js';
import { enqueueWebhookReview } from '../analysis/analysis.jobs.js';
import { handleReviewCommand, getReviewControl } from './review.controls.js';

const actions = new Set(['opened', 'synchronize', 'reopened', 'ready_for_review']);
const repositoryPattern = /^[a-z\d-]+\/[\w.-]+$/i;
const shaPattern = /^[a-f\d]{40}$/i;

// A single-process demo: acknowledge quickly, then reuse the manual review pipeline.
function createWebhookHandler({ analyze = analyzePullRequest, find = findAnalysis, enqueue = enqueueWebhookReview, command = handleReviewCommand, control = getReviewControl, getToken = installationToken, log = entry => process.stdout.write(JSON.stringify(entry) + '\n') } = {}) {
  const active = new Set();

  return function handleGitHubWebhook(request, response) {
    const secret = process.env.GITHUB_WEBHOOK_SECRET?.trim();
    const repository = process.env.GITHUB_WEBHOOK_REPOSITORY?.trim().toLowerCase();
    if (!secret || (!appMode() && !repositoryPattern.test(repository || ''))) {
      return response.status(503).json({ message: 'GitHub webhook is not configured.' });
    }
    if (!Buffer.isBuffer(request.body)) return response.status(415).json({ message: 'Send application/json.' });
    const signature = request.headers['x-hub-signature-256'];
    const expected = createHmac('sha256', secret).update(request.body).digest();
    if (typeof signature !== 'string' || !/^sha256=[a-f\d]{64}$/i.test(signature)
      || !timingSafeEqual(expected, Buffer.from(signature.slice(7), 'hex'))) {
      return response.status(401).json({ message: 'Invalid webhook signature.' });
    }

    let payload;
    try { payload = JSON.parse(request.body.toString('utf8')); }
    catch { return response.status(400).json({ message: 'Invalid webhook JSON.' }); }
    if (!payload || typeof payload !== 'object' || Array.isArray(payload)) return response.status(400).json({ message: 'Invalid webhook payload.' });
    const event = request.headers['x-github-event'];
    if (event === 'ping') return response.status(200).json({ status: 'ready' });
    if (event === 'issue_comment') {
      return Promise.resolve().then(() => command(payload)).then(result => result.payload
        ? acceptReview(result.payload, result) : response.status(200).json({ status: result.status }))
        .catch(error => response.status(error.statusCode === 403 ? 403 : 503).json({ message: 'Review command could not be processed. Check access and configuration.' }));
    }
    if (event !== 'pull_request' || !actions.has(payload.action)) return response.status(200).json({ status: 'ignored' });
    return acceptReview(payload);

    function acceptReview(payload, commandResult) {
    const pr = payload.pull_request;
    const deliveryId = request.headers['x-github-delivery'];
    if (!pr || !Number.isSafeInteger(payload.number) || payload.number < 1 || pr.number !== payload.number
      || !['open', 'closed'].includes(pr.state) || typeof pr.draft !== 'boolean'
      || typeof pr.base?.sha !== 'string' || typeof pr.head?.sha !== 'string'
      || !shaPattern.test(pr.base.sha) || !shaPattern.test(pr.head.sha)
      || typeof payload.repository?.full_name !== 'string'
      || typeof deliveryId !== 'string' || !/^[a-f\d]{8}(?:-[a-f\d]{4}){3}-[a-f\d]{12}$/i.test(deliveryId)) {
      return response.status(400).json({ message: 'Invalid Pull Request event.' });
    }
    const eventRepository = payload.repository.full_name.toLowerCase();
    if (!repositoryPattern.test(eventRepository) || (!appMode() && eventRepository !== repository)) return response.status(403).json({ message: 'Repository is not enabled for this webhook.' });
    const installationId = appMode() ? payload.installation?.id : undefined;
    if (appMode() && (!Number.isSafeInteger(installationId) || installationId < 1)) return response.status(400).json({ message: 'Missing installation.' });
    if (pr.draft || pr.state !== 'open') return response.status(200).json({ status: 'ignored' });

    const baseSha = pr.base.sha.toLowerCase();
    const headSha = pr.head.sha.toLowerCase();
    const id = 'webhook-' + createHash('sha256').update(`${installationId ? installationId + ':' : ''}${eventRepository}#${payload.number}:${baseSha}:${headSha}${commandResult ? ':' + commandResult.command + ':' + commandResult.commentId : ''}`).digest('hex');
    const url = `https://github.com/${eventRepository}/pull/${payload.number}`;
    const options = { id, installationId, expectedRevision: { baseSha, headSha },
      trigger: { type: 'github_webhook', deliveryId, action: payload.action, repository: eventRepository, baseSha, headSha,
        ...(Number.isSafeInteger(pr.user?.id) && pr.user.id > 0 ? { actorId: String(pr.user.id) } : {}),
        ...(commandResult ? { command: commandResult.command, actorId: commandResult.actorId } : {}) } };
    if (process.env.REVIEW_EXECUTION === 'queue') {
      return Promise.resolve().then(() => enqueue({ id, payload: { url, options } }))
        .then(() => response.status(202).json({ status: 'accepted', analysisId: id }))
        .catch(() => response.status(503).json({ message: 'Review could not be queued. Redeliver this event later.' }));
    }
    if (process.env.NODE_ENV === 'production') return response.status(503).json({ message: 'Configure durable review execution.' });
    if (active.has(id)) return response.status(202).json({ status: 'duplicate', analysisId: id });
    if (active.size >= 2) return response.status(503).json({ message: 'Webhook reviewer is busy. Redeliver this event later.' });
    active.add(id);
    response.status(202).json({ status: 'accepted', analysisId: id });

    // No durable queue: interrupted jobs require GitHub redelivery after a restart.
    setImmediate(async () => {
      const details = { event: 'github_webhook', deliveryId, analysisId: id };
      try {
        if (installationId && !commandResult && (await control({ installationId, repository: eventRepository, number: payload.number })).paused) {
          log({ ...details, status: 'paused' }); return;
        }
        if (await find(id)) {
          log({ ...details, status: 'duplicate' });
          return;
        }
        if (installationId && !await consumeReviewBudget('installation:' + installationId)) {
          log({ ...details, status: 'failed', errorCode: 'REVIEW_LIMIT' });
          return;
        }
        const githubToken = installationId ? await getToken(installationId, eventRepository) : undefined;
        const result = await analyze(url, { ...options, githubToken });
        log({ ...details, status: ['completed', 'skipped'].includes(result.body.status) ? result.body.status : 'failed', httpStatus: result.status, aiStatus: result.body.aiStatus });
      } catch {
        log({ ...details, status: 'failed', errorCode: 'WEBHOOK_PROCESSING_FAILED' });
      } finally {
        active.delete(id);
      }
    });
    return response;
    }
  };
}

export { createWebhookHandler };
