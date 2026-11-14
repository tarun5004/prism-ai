import mongoose from 'mongoose';
import { randomUUID } from 'node:crypto';
import { QueueClient } from '@azure/storage-queue';
import { DefaultAzureCredential } from '@azure/identity';
import { enqueueReviewJob, findReviewJob, claimReviewJob, finishReviewJob, findAnalysis } from './analysis.repository.js';
import { analyzePullRequest } from './analysis.service.js';
import { installationToken, consumeReviewBudget } from '../pullRequest/github.app.js';

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
  if (saved.status !== 'queued') return;
  // Queue messages contain an ID only; credentials and PR payload stay out of Azure.
  await queue.sendMessage(Buffer.from(job.id).toString('base64'), { messageTimeToLive: 604800 });
}

// One message per process suits an event-triggered Container Apps Job.
async function processNextReview({ queue, analyze = analyzePullRequest, resumeId } = {}) {
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
    if (!await findAnalysis(id)) {
      const { url, options } = job.payload;
      if (!resumeId && options.installationId && !await consumeReviewBudget('installation:' + options.installationId)) {
        await finishReviewJob(id, owner, 'failed', 'REVIEW_LIMIT'); await remove(); return { status: 'failed', id };
      }
      const githubToken = options.installationId ? await installationToken(options.installationId, options.trigger.repository) : undefined;
      const result = await analyze(url, { ...options, id, githubToken, resume: Boolean(resumeId) });
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

export { getReviewQueue, enqueueWebhookReview, processNextReview };
