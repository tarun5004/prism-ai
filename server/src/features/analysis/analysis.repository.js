import mongoose from 'mongoose';
import Analysis from './analysis.model.js';

const analyses = new Map();

// Save a beta analysis in MongoDB when connected, otherwise keep local development in memory.
async function saveAnalysis(analysis) {
  if (mongoose.connection.readyState === 1) {
    await Analysis.findOneAndUpdate({ id: analysis.id }, analysis, { upsert: true, new: true });
    return analysis;
  }

  analyses.set(analysis.id, analysis);
  return analysis;
}

// Return recent analyses from the configured store for the dashboard history list.
async function listAnalyses() {
  if (mongoose.connection.readyState === 1) {
    return Analysis.find().sort({ createdAt: -1 }).limit(20).lean();
  }

  return Array.from(analyses.values()).sort(
    (firstAnalysis, secondAnalysis) => new Date(secondAnalysis.createdAt) - new Date(firstAnalysis.createdAt)
  );
}

// Find one stored analysis by its beta identifier.
async function findAnalysis(analysisId) {
  if (mongoose.connection.readyState === 1) {
    return Analysis.findOne({ id: analysisId }).lean();
  }

  return analyses.get(analysisId);
}

export { findAnalysis, listAnalyses, saveAnalysis };