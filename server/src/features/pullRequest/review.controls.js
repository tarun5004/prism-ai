import mongoose from 'mongoose';
import { ReviewControl } from '../analysis/analysis.model.js';
import { findLatestAnalysis } from '../analysis/analysis.repository.js';
import { githubRequest, installationToken } from './github.app.js';

const local = new Map();
const repositoryPattern = /^[a-z\d-]+\/[\w.-]+$/i;
const help = 'PRism commands: `@prism-ai review` (new changes), `@prism-ai full review`, `@prism-ai pause`, `@prism-ai resume`, `@prism-ai summary`, `@prism-ai help`. Pause stops automatic reviews; explicit review runs once. Reviews are advisory, not merge approval.';

function controlKey({ installationId, repository, number }) {
  if (!Number.isSafeInteger(installationId) || installationId < 1 || !repositoryPattern.test(repository || '')
    || !Number.isSafeInteger(number) || number < 1) throw Error('Invalid review control scope.');
  return `${installationId}:${repository.toLowerCase()}#${number}`;
}

function persistent() {
  if (mongoose.connection.readyState === 1) return true;
  if (process.env.NODE_ENV === 'production') throw Error('Review control storage unavailable.');
  return false;
}

async function getReviewControl(scope) {
  const key = controlKey(scope);
  const record = persistent() ? await ReviewControl.findOne({ key }).lean() : local.get(key);
  return record || { key, paused: false, commentId: 0 };
}

async function setReviewPaused(scope, paused, commentId) {
  const key = controlKey(scope);
  if (typeof paused !== 'boolean' || !Number.isSafeInteger(commentId) || commentId < 1) throw Error('Invalid review control.');
  if (persistent()) {
    // Wait for the unique scope index before concurrent first-time upserts.
    await ReviewControl.init();
    try { await ReviewControl.updateOne({ key }, { $setOnInsert: { paused: false, commentId: 0 } }, { upsert: true }); }
    catch (error) { if (error.code !== 11000) throw error; }
    // Older/redelivered comments cannot reverse a newer pause/resume decision.
    await ReviewControl.updateOne({ key, commentId: { $lt: commentId } }, { $set: { paused, commentId } });
  } else {
    if (local.size >= 1000 && !local.has(key)) throw Error('Review control limit reached.');
    if ((local.get(key)?.commentId || 0) < commentId) local.set(key, { key, paused, commentId });
  }
  return getReviewControl(scope);
}

function parseReviewCommand(payload) {
  if (payload.action !== 'created' || !payload.issue?.pull_request || payload.comment?.user?.type !== 'User'
    || typeof payload.comment.body !== 'string' || payload.comment.body.length > 100) return null;
  return payload.comment.body.trim().match(/^@prism-ai\s+(full review|review|pause|resume|summary|help)$/i)?.[1].toLowerCase() || null;
}

async function postCommandReply(scope, commentId, body, token, request = githubRequest) {
  const path = `/repos/${scope.repository}/issues/${scope.number}/comments`;
  const marker = `<!-- prism-command:${commentId} -->`;
  for (let page = 1; page <= 3; page++) {
    const comments = await request(`${path}?per_page=100&page=${page}`, token);
    if (!Array.isArray(comments)) throw Error('Command reply unavailable.');
    if (comments.some(item => item.user?.login === `${process.env.GITHUB_APP_SLUG}[bot]` && item.body?.includes(marker))) return;
    if (comments.length < 100) { await request(path, token, { body: `${marker}\n${body}` }); return; }
  }
  throw Error('Command reply scan limit reached.');
}

async function handleReviewCommand(payload, { request = githubRequest, getToken = installationToken, reply = postCommandReply } = {}) {
  const command = parseReviewCommand(payload);
  if (process.env.GITHUB_REVIEW_COMMANDS !== 'true' || !command) return { status: 'ignored' };
  const scope = { installationId: payload.installation?.id, repository: payload.repository?.full_name, number: payload.issue.number };
  controlKey(scope);
  const user = payload.comment.user;
  if (!/^[a-z\d-]+$/i.test(user.login || '') || !Number.isSafeInteger(payload.comment.id) || payload.comment.id < 1) throw Error('Invalid command actor.');
  const token = await getToken(scope.installationId, scope.repository, { writeReviews: true });
  const access = await request(`/repos/${scope.repository}/collaborators/${encodeURIComponent(user.login)}/permission`, token);
  if (!['write', 'maintain', 'admin'].includes(access.permission)) throw Object.assign(Error('Write permission required for review commands.'), { statusCode: 403 });
  if (command === 'review' || command === 'full review') {
    const pr = await request(`/repos/${scope.repository}/pulls/${scope.number}`, token);
    return { command, commentId: payload.comment.id, actorId: String(user.id), payload: {
      action: 'opened', number: scope.number, installation: payload.installation, repository: payload.repository, pull_request: pr } };
  }
  let message = help;
  if (command === 'pause' || command === 'resume') {
    const control = await setReviewPaused(scope, command === 'pause', payload.comment.id);
    message = control.paused ? 'Automatic PRism reviews are paused for this PR. Use `@prism-ai resume` or a one-shot `@prism-ai review`.' : 'Automatic PRism reviews are enabled for future PR events. Use `@prism-ai review` to review now.';
  } else if (command === 'summary') {
    const report = await findLatestAnalysis(`${scope.repository}#${scope.number}`, scope.installationId);
    const origin = new URL(process.env.APP_ORIGIN);
    if (!['http:', 'https:'].includes(origin.protocol) || origin.origin !== process.env.APP_ORIGIN) throw Error('Invalid application origin.');
    message = report && /^[a-z\d_-]{1,128}$/i.test(report.id) ? `[Latest saved advisory report](${origin.origin}/analyses/${report.id}). AI status: ${['completed', 'partial', 'unavailable', 'skipped'].includes(report.aiStatus) ? report.aiStatus : 'unknown'}. This may describe an earlier revision.` : 'No saved review is available for this PR yet.';
  }
  await reply(scope, payload.comment.id, message, token, request);
  return { status: command === 'pause' || command === 'resume' ? 'updated' : command };
}

export { parseReviewCommand, getReviewControl, setReviewPaused, handleReviewCommand };
