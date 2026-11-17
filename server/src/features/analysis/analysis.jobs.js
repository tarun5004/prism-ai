import mongoose from 'mongoose';
import { randomUUID, createHash } from 'node:crypto';
import { QueueClient } from '@azure/storage-queue';
import { DefaultAzureCredential } from '@azure/identity';
import { enqueueReviewJob, findReviewJob, claimReviewJob, finishReviewJob, findAnalysis } from './analysis.repository.js';
import { analyzePullRequest } from './analysis.service.js';
import { installationToken, consumeReviewBudget, githubRequest } from '../pullRequest/github.app.js';
import { getReviewControl } from '../pullRequest/review.controls.js';

function getReviewQueue() {
  const options = { retryOptions: { maxTries: 1, tryTimeoutInMs: 5000 } };
  if (process.env.AZURE_STORAGE_CONNECTION_STRING) return new QueueClient(process.env.AZURE_STORAGE_CONNECTION_STRING, process.env.AZURE_REVIEW_QUEUE_NAME || 'prism-reviews', options);
  const address = new URL(process.env.AZURE_REVIEW_QUEUE_URL || 'invalid:');
  if (address.protocol !== 'https:') throw Error('Configure the review queue.');
  return new QueueClient(address.href, new DefaultAzureCredential(), options);
}

async function enqueueWebhookReview(job, queue = getReviewQueue()) {
  if (mongoose.connection.readyState !== 1) throw Error('Persistent job storage required.');
  const saved = await enqueueReviewJob(job);
  if (saved.status !== 'queued') return saved;
  // Queue messages contain an ID only; credentials and PR payload stay out of Azure.
  await queue.sendMessage(Buffer.from(job.id).toString('base64'), { messageTimeToLive: 604800 });
  return saved;
}

// Manual and webhook requests for the same revision share one durable job.
async function enqueueManualReview(url, auth, { request = githubRequest, enqueue = enqueueWebhookReview } = {}) {
  const match = url.match(/^https:\/\/github\.com\/([a-z\d-]+\/[\w.-]+)\/pull\/([1-9]\d*)\/?$/i);
  if (!match) throw Object.assign(Error('Enter a valid GitHub Pull Request URL.'), { statusCode: 400 });
  const repository = match[1].toLowerCase();
  const access = auth?.repositories?.find(item => item.repository === repository);
  if (!access || !Number.isSafeInteger(access.installationId) || access.installationId < 1) throw Object.assign(Error('Verify your repository access first.'), { statusCode: 403 });
  const pr = await request(`/repos/${repository}/pulls/${match[2]}`, auth.token);
  const baseSha = pr.base?.sha?.toLowerCase();
  const headSha = pr.head?.sha?.toLowerCase();
  if (!/^[a-f\d]{40}$/.test(baseSha || '') || !/^[a-f\d]{40}$/.test(headSha || '')) throw Error('GitHub returned an invalid revision.');
  const id = 'webhook-' + createHash('sha256').update(`${access.installationId}:${repository}#${match[2]}:${baseSha}:${headSha}`).digest('hex');
  const saved = await enqueue({ id, payload: { url: `https://github.com/${repository}/pull/${match[2]}`, options: {
    installationId: access.installationId, expectedRevision: { baseSha, headSha }, notificationUserId: auth.userId,
    trigger: { type: 'manual', repository, baseSha, headSha }
  } } });
  return { id, status: saved.status };
}

// One message per process suits an event-triggered Container Apps Job.
async function processNextReview({ queue, analyze = analyzePullRequest, getToken = installationToken, resumeId } = {}) {
  let id = resumeId; let remove = async () => {};
  if (!resumeId) {
    queue ||= getReviewQueue();
    const { receivedMessageItems } = await queue.receiveMessages({ numberOfMessages: 1, visibilityTimeout: 900 });
    const message = receivedMessageItems[0];
    if (!message) return { status: 'empty' };
    id = Buffer.from(message.messageText, 'base64').toString('utf8');
    remove = () => queue.deleteMessage(message.messageId, message.popReceipt);
  }
  if (!/^webhook-[a-f\d]{64}$/.test(id)) { await remove(); return { status: 'invalid' }; }
  const owner = randomUUID();
  const job = await claimReviewJob(id, owner, undefined, Boolean(resumeId));
  if (!job) {
    const existing = await findReviewJob(id);
    if (!existing || existing.status !== 'running') await remove();
    return { status: existing?.status || 'missing', id };
  }
  try {
    const existing = await findAnalysis(id);
    if (existing && existing.status !== 'completed') throw Error('A failed saved report requires a fresh review.');
    if (!existing) {
      const { url, options } = job.payload;
      const number = Number(url.match(/\/pull\/(\d+)$/)?.[1]);
      if (options.installationId && !options.trigger?.command && (await getReviewControl({ installationId: options.installationId, repository: options.trigger.repository, number })).paused) {
        await finishReviewJob(id, owner, 'skipped', 'REVIEW_PAUSED'); await remove(); return { status: 'skipped', id };
      }
      if (!resumeId && options.installationId && !await consumeReviewBudget('installation:' + options.installationId)) {
        await finishReviewJob(id, owner, 'failed', 'REVIEW_LIMIT'); await remove(); return { status: 'failed', id };
      }
      const githubToken = options.installationId ? await getToken(options.installationId, options.trigger.repository) : undefined;
      const result = await analyze(url, { ...options, id, githubToken, resume: Boolean(resumeId) });
      if (result.body?.status === 'skipped') { await finishReviewJob(id, owner, 'skipped'); await remove(); return { status: 'skipped', id }; }
      if (result.body?.status !== 'completed') throw Error('Review did not complete.');
    }
    await finishReviewJob(id, owner, 'completed');
  } catch {
    // Retain an inspectable failure; queue replay must not repeat a model request.
    await finishReviewJob(id, owner, 'failed', 'REVIEW_FAILED');
  }
  await remove();
  return { status: (await findReviewJob(id)).status, id };
}

export { getReviewQueue, enqueueWebhookReview, enqueueManualReview, processNextReview };
