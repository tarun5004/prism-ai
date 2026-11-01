import mongoose from 'mongoose';
import Analysis from './analysis.model.js';

const analyses = new Map();

// Save a beta analysis in MongoDB when connected, otherwise keep local development in memory.
async function saveAnalysis(analysis) {
  if (mongoose.connection.readyState === 1) {
    await Analysis.create(analysis);
    return analysis;
  }

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

export { findAnalysis, listAnalyses, saveAnalysis, saveFindingFeedback, saveGitHubFeedback };
