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

  const streaming = typeof request.headers?.accept === 'string' && request.headers.accept.includes('application/x-ndjson');
  const connected = () => !response.destroyed && !response.writableEnded;
  const sendFrame = frame => {
    if (streaming && connected()) response.write(`${JSON.stringify(frame)}\n`);
  };
  const progress = stage => sendFrame({ type: 'progress', stage });
  const reply = (status, value) => {
    if (!streaming) return response.status(status).json(value);
    sendFrame(status === 201 ? { type: 'result', report: value }
      : { type: 'error', message: value.message || value.error || 'Analysis could not be completed.' });
    if (connected()) response.end();
  };
  if (streaming && connected()) {
    response.status(200);
    response.setHeader('Content-Type', 'application/x-ndjson; charset=utf-8');
    response.setHeader('Cache-Control', 'no-store');
    response.setHeader('X-Accel-Buffering', 'no');
    response.flushHeaders();
  }

  try {
    progress('fetching');
    const pullRequest = await fetchPullRequest(pullRequestUrl);
    const ruleFindings = runRules(pullRequest);
    progress('context');
    // Source enrichment is transient; only validated review evidence reaches storage/API.
    const reviewInput = process.env.GEMINI_API_KEY?.trim()
      ? { ...pullRequest, reviewContext: await fetchReviewContext(pullRequest) } : pullRequest;
    progress('reviewing');
    const aiResult = await runAiAnalysis(reviewInput);
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

    progress('saving');
    return reply(201, await saveAnalysis(analysis));
  } catch (error) {
    if (!(error instanceof PullRequestError)) {
      return reply(500, { message: 'Analysis could not be saved or completed. Please try again.' });
    }
    if (error.statusCode === 400) return reply(400, { message: error.message });
    const failedAnalysis = {
      id: randomUUID(),
      status: 'failed',
      createdAt: new Date().toISOString(),
      pullRequest: { url: pullRequestUrl },
      findings: [],
      error: error.message,
      errorCode: error.code
    };

    try {
      await saveAnalysis(failedAnalysis);
    } catch {
      return reply(500, { message: 'The failed analysis could not be saved. Please try again.' });
    }
    return reply(error.statusCode, failedAnalysis);
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
