import { analyzePullRequest } from './analysis.service.js';
import { findAnalysis, listAnalyses } from './analysis.repository.js';

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

  const result = await analyzePullRequest(pullRequestUrl, { progress });
  return reply(result.status, result.body);
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
