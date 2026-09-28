import { runAiAnalysis } from '../ai/ai.service.js';
import { fetchPullRequest } from '../pullRequest/pullRequest.service.js';
import { findAnalysis, listAnalyses, saveAnalysis } from './analysis.repository.js';
import { runRules } from './analysis.rules.js';

let nextAnalysisId = 1;

// Create a report from one Pull Request URL and save the normalized beta result.
async function createAnalysis(request, response) {
  const pullRequestUrl = request.body?.pullRequestUrl?.trim();

  if (!pullRequestUrl) {
    return response.status(400).json({ message: 'Pull Request URL is required.' });
  }

  try {
    const pullRequest = await fetchPullRequest(pullRequestUrl);
    const ruleFindings = runRules(pullRequest);
    const aiResult = await runAiAnalysis(pullRequest);
    const analysis = {
      id: String(nextAnalysisId++),
      status: 'completed',
      createdAt: new Date().toISOString(),
      pullRequest,
      findings: [...ruleFindings, ...aiResult.findings],
      aiStatus: aiResult.status
    };

    return response.status(201).json(await saveAnalysis(analysis));
  } catch (error) {
    const failedAnalysis = {
      id: String(nextAnalysisId++),
      status: 'failed',
      createdAt: new Date().toISOString(),
      pullRequest: { url: pullRequestUrl },
      findings: [],
      error: error.message
    };

    await saveAnalysis(failedAnalysis);
    return response.status(502).json(failedAnalysis);
  }
}

// Return recent beta analyses for the dashboard history list.
async function getAnalyses(request, response) {
  response.json(await listAnalyses());
}

// Return one previously saved beta analysis.
async function getAnalysis(request, response) {
  const analysis = await findAnalysis(request.params.analysisId);

  if (!analysis) {
    return response.status(404).json({ message: 'Analysis not found.' });
  }

  return response.json(analysis);
}

export { createAnalysis, getAnalyses, getAnalysis };