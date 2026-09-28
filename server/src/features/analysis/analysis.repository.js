const analyses = new Map();

// Save a beta analysis in memory so the first workflow stays easy to run locally.
function saveAnalysis(analysis) {
  analyses.set(analysis.id, analysis);
  return analysis;
}

// Return recent analyses for the dashboard history list.
function listAnalyses() {
  return Array.from(analyses.values()).sort(
    (firstAnalysis, secondAnalysis) => new Date(secondAnalysis.createdAt) - new Date(firstAnalysis.createdAt)
  );
}

// Find one stored analysis by its beta identifier.
function findAnalysis(analysisId) {
  return analyses.get(analysisId);
}

export { findAnalysis, listAnalyses, saveAnalysis };