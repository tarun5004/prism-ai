import mongoose from 'mongoose';
import Analysis, { ReviewJob } from './analysis.model.js';

const analyses = new Map();
const localJobs = new Map();

async function enqueueReviewJob(job) {
  if (mongoose.connection.readyState === 1) {
    try { return await ReviewJob.findOneAndUpdate({ id: job.id }, { $setOnInsert: { ...job, status: 'queued' } }, { upsert: true, new: true }).lean(); }
    catch (error) { if (error.code === 11000) return ReviewJob.findOne({ id: job.id }).lean(); throw error; }
  }
  if (process.env.NODE_ENV === 'production') throw Error('Job storage unavailable.');
  if (!localJobs.has(job.id)) localJobs.set(job.id, { ...job, status: 'queued', createdAt: new Date() });
  return localJobs.get(job.id);
}

async function findReviewJob(id) {
  if (mongoose.connection.readyState === 1) return ReviewJob.findOne({ id }).lean();
  if (process.env.NODE_ENV === 'production') throw Error('Job storage unavailable.');
  return localJobs.get(id);
}

async function claimReviewJob(id, owner, leaseUntil = new Date(Date.now() + 900000), resume = false) {
  const allowed = resume ? ['failed', 'unknown'] : ['queued'];
  if (mongoose.connection.readyState === 1) {
    // A crashed run may already have called the provider: never regenerate blindly.
    await ReviewJob.updateOne({ id, status: 'running', leaseUntil: { $lt: new Date() } }, { $set: { status: 'unknown', errorCode: 'INTERRUPTED_REVIEW' } });
    return ReviewJob.findOneAndUpdate({ id, status: { $in: allowed } }, { $set: { status: 'running', owner, leaseUntil } }, { new: true }).lean();
  }
  if (process.env.NODE_ENV === 'production') throw Error('Job storage unavailable.');
  const job = localJobs.get(id);
  if (job?.status === 'running' && job.leaseUntil < new Date()) { job.status = 'unknown'; job.errorCode = 'INTERRUPTED_REVIEW'; }
  if (!allowed.includes(job?.status)) return null;
  Object.assign(job, { status: 'running', owner, leaseUntil });
  return job;
}

async function finishReviewJob(id, owner, status, errorCode) {
  if (!['completed', 'failed'].includes(status)) throw Error('Invalid job result.');
  if (mongoose.connection.readyState === 1) return ReviewJob.findOneAndUpdate({ id, owner, status: 'running' }, { $set: { status, ...(errorCode ? { errorCode } : {}) } }, { new: true }).lean();
  if (process.env.NODE_ENV === 'production') throw Error('Job storage unavailable.');
  const job = localJobs.get(id);
  if (job?.owner === owner && job.status === 'running') Object.assign(job, { status, errorCode });
  return job;
}

// Save a beta analysis in MongoDB when connected, otherwise keep local development in memory.
async function saveAnalysis(analysis) {
  if (mongoose.connection.readyState === 1) {
    await Analysis.create(analysis);
    return analysis;
  }

  if (process.env.NODE_ENV === 'production') throw Error('Persistent report storage unavailable.');

  if (analyses.has(analysis.id)) throw new Error('Analysis already exists.');
  analyses.set(analysis.id, analysis);
  return analysis;
}

// Return recent analyses from the configured store for the dashboard history list.
async function listAnalyses({ repositories, installationId, localOnly = false } = {}) {
  const query = repositories ? { $or: repositories.map(item => ({ installationId: item.installationId, 'pullRequest.repository': item.repository })) }
    : installationId ? { installationId } : localOnly ? { installationId: { $exists: false } } : {};
  if (repositories && !repositories.length) return [];
  if (mongoose.connection.readyState === 1) {
    return Analysis.find(query).sort({ createdAt: -1 }).limit(20).lean();
  }

  return Array.from(analyses.values()).filter(report => repositories
    ? repositories.some(item => item.installationId === report.installationId && item.repository === report.pullRequest?.repository?.toLowerCase())
    : installationId ? report.installationId === installationId : !localOnly || !report.installationId).sort(
    (firstAnalysis, secondAnalysis) => new Date(secondAnalysis.createdAt) - new Date(firstAnalysis.createdAt)
  ).slice(0, 20);
}

// Find one stored analysis by its beta identifier.
async function findAnalysis(analysisId) {
  if (mongoose.connection.readyState === 1) {
    return Analysis.findOne({ id: analysisId }).lean();
  }

  return analyses.get(analysisId);
}

async function saveFindingFeedback(id, index, userId, annotation) {
  if (!Number.isSafeInteger(index) || index < 0 || !/^(local|\d+)$/.test(userId)) throw Error('Invalid feedback key.');
  const key = `${index}_${userId}`;
  if (mongoose.connection.readyState === 1) {
    return Analysis.findOneAndUpdate({ id, [`findings.${index}`]: { $exists: true } }, { $set: { [`feedback.${key}`]: annotation } }, { new: true }).lean();
  }
  const report = analyses.get(id);
  if (!report || !report.findings[index]) return null;
  report.feedback = { ...report.feedback, [key]: annotation };
  return report;
}

async function saveGitHubFeedback(id, feedback) {
  if (mongoose.connection.readyState === 1) return Analysis.findOneAndUpdate({ id }, { $set: { githubFeedback: feedback } }, { new: true }).lean();
  const report = analyses.get(id);
  if (report) report.githubFeedback = feedback;
  return report;
}

async function saveReviewDelivery(id, delivery) {
  const fields = { githubInline: delivery.githubInline, githubStatus: delivery.githubStatus };
  if (mongoose.connection.readyState === 1) return Analysis.findOneAndUpdate({ id }, { $set: fields }, { new: true }).lean();
  const report = analyses.get(id);
  if (report) Object.assign(report, fields);
  return report;
}

async function claimEmailNotification(id) {
  if (mongoose.connection.readyState === 1) return Boolean(await Analysis.findOneAndUpdate({ id, 'emailNotification.status': { $exists: false } }, { $set: { emailNotification: { status: 'sending' } } }).lean());
  if (process.env.NODE_ENV === 'production') throw Error('Persistent report storage unavailable.');
  const report = analyses.get(id);
  if (!report || report.emailNotification?.status) return false;
  report.emailNotification = { status: 'sending' };
  return true;
}

async function saveEmailNotification(id, notification) {
  if (mongoose.connection.readyState === 1) return Analysis.findOneAndUpdate({ id }, { $set: { emailNotification: notification } }, { new: true }).lean();
  if (process.env.NODE_ENV === 'production') throw Error('Persistent report storage unavailable.');
  const report = analyses.get(id);
  if (report) report.emailNotification = notification;
  return report;
}

// Same-PR, same-installation history supplies hints, never current code evidence.
async function findPreviousAnalysis(pullRequest, installationId, { successfulOnly = false } = {}) {
  if (typeof pullRequest.key !== 'string' || !/^[a-f\d]{40}$/i.test(pullRequest.headSha || '') || !/^[a-f\d]{40}$/i.test(pullRequest.baseSha || '')) return null;
  const query = { status: 'completed', installationId: installationId || { $exists: false }, 'pullRequest.key': pullRequest.key.toLowerCase(), $or: [{ 'pullRequest.headSha': { $ne: pullRequest.headSha } }, { 'pullRequest.baseSha': { $ne: pullRequest.baseSha } }] };
  if (successfulOnly) query.aiStatus = 'completed';
  if (mongoose.connection.readyState === 1) return Analysis.findOne(query).sort({ createdAt: -1 }).select('id installationId aiStatus pullRequest findings feedback').lean();
  return Array.from(analyses.values()).filter(report => report.status === 'completed' && (report.installationId || undefined) === installationId
    && (!successfulOnly || report.aiStatus === 'completed')
    && report.pullRequest?.key?.toLowerCase() === pullRequest.key.toLowerCase()
    && (report.pullRequest.headSha !== pullRequest.headSha || report.pullRequest.baseSha !== pullRequest.baseSha))
    .sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt))[0] || null;
}

export { findAnalysis, listAnalyses, saveAnalysis, saveFindingFeedback, saveGitHubFeedback, findPreviousAnalysis };
export { enqueueReviewJob, findReviewJob, claimReviewJob, finishReviewJob };
export { claimEmailNotification, saveEmailNotification };
export { saveReviewDelivery };
