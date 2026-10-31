import { randomUUID } from 'node:crypto';
import { runAiAnalysis } from '../ai/ai.service.js';
import { fetchPullRequest, fetchReviewContext, PullRequestError } from '../pullRequest/pullRequest.service.js';
import { findAnalysis, listAnalyses, saveAnalysis } from './analysis.repository.js';
import { runRules } from './analysis.rules.js';

// Create a report from one Pull Request URL and save the normalized beta result.
async function createAnalysis(request, response) {
  const pullRequestUrl = typeof request.body?.pullRequestUrl === 'string' ? request.body.pullRequestUrl.trim() : '';

  if (!pullRequestUrl) {
    return response.status(400).json({ message: 'Pull Request URL is required.' });
  }

  try {
    const pullRequest = await fetchPullRequest(pullRequestUrl);
    const ruleFindings = runRules(pullRequest);
    if (process.env.GEMINI_API_KEY?.trim()) pullRequest.reviewContext = await fetchReviewContext(pullRequest);
    const aiResult = await runAiAnalysis(pullRequest);
    const analysis = {
      id: randomUUID(),
      status: 'completed',
      createdAt: new Date().toISOString(),
      pullRequest,
      findings: [...ruleFindings, ...aiResult.findings],
      aiStatus: aiResult.status,
      aiModel: aiResult.model,
      aiCoverage: aiResult.coverage,
      aiDiagnostics: aiResult.diagnostics,
      ...(aiResult.review ? { aiReview: aiResult.review } : {}),
      ...(aiResult.error ? { aiError: aiResult.error } : {})
    };

    return response.status(201).json(await saveAnalysis(analysis));
  } catch (error) {
    if (!(error instanceof PullRequestError)) {
      return response.status(500).json({ message: 'Analysis could not be saved or completed. Please try again.' });
    }
    if (error.statusCode === 400) return response.status(400).json({ message: error.message });
    const failedAnalysis = {
      id: randomUUID(),
      status: 'failed',
      createdAt: new Date().toISOString(),
      pullRequest: { url: pullRequestUrl },
      findings: [],
      error: error.message
    };

    try {
      await saveAnalysis(failedAnalysis);
    } catch {
      return response.status(500).json({ message: 'The failed analysis could not be saved. Please try again.' });
    }
    return response.status(error.statusCode).json(failedAnalysis);
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
