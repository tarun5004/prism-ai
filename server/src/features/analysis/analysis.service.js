import { randomUUID } from 'node:crypto';
import { runAiAnalysis } from '../ai/ai.service.js';
import { prepareAiInput } from '../ai/ai.context.js';
import { fetchPullRequest, fetchReviewContext, PullRequestError } from '../pullRequest/pullRequest.service.js';
import { saveAnalysis } from './analysis.repository.js';
import { runRules } from './analysis.rules.js';

// Shared by manual requests and verified GitHub events.
async function analyzePullRequest(pullRequestUrl, { progress = () => {}, id = randomUUID(), trigger, expectedRevision, installationId, githubToken } = {}) {
  try {
    progress('fetching');
    const pullRequest = await fetchPullRequest(pullRequestUrl, { token: githubToken });
    if (expectedRevision && (pullRequest.baseSha !== expectedRevision.baseSha || pullRequest.headSha !== expectedRevision.headSha)) {
      throw new PullRequestError('PR revision changed before webhook review. Use the latest event or analyze the PR manually.', 409);
    }
    const ruleFindings = runRules(pullRequest);
    const aiEnabled = Boolean(process.env.GEMINI_API_KEY?.trim()) && prepareAiInput(pullRequest).files.length > 0;
    if (aiEnabled) progress('context');
    // Source enrichment is transient; only validated review evidence reaches storage/API.
    const reviewInput = aiEnabled
      ? { ...pullRequest, reviewContext: await fetchReviewContext(pullRequest, { token: githubToken }) } : pullRequest;
    const aiResult = await runAiAnalysis(reviewInput, { onRequest: () => progress('reviewing') });
    const analysis = {
      id,
      ...(installationId ? { installationId } : {}),
      status: 'completed',
      createdAt: new Date().toISOString(),
      pullRequest,
      findings: [...ruleFindings, ...aiResult.findings],
      ...(trigger ? { trigger } : {}),
      aiStatus: aiResult.status,
      aiModel: aiResult.model,
      aiCoverage: aiResult.coverage,
      aiDiagnostics: aiResult.diagnostics,
      ...(aiResult.review ? { aiReview: aiResult.review } : {}),
      ...(aiResult.error ? { aiError: aiResult.error } : {})
    };

    progress('saving');
    return { status: 201, body: await saveAnalysis(analysis) };
  } catch (error) {
    if (!(error instanceof PullRequestError)) {
      return { status: 500, body: { message: 'Analysis could not be saved or completed. Please try again.' } };
    }
    if (error.statusCode === 400) return { status: 400, body: { message: error.message } };
    const failedAnalysis = {
      id,
      ...(installationId ? { installationId } : {}),
      status: 'failed',
      createdAt: new Date().toISOString(),
      pullRequest: { url: pullRequestUrl, ...(installationId ? { repository: pullRequestUrl.match(/^https:\/\/github\.com\/([^/]+\/[^/]+)\//i)?.[1] } : {}) },
      findings: [],
      ...(trigger ? { trigger } : {}),
      error: error.message,
      errorCode: error.code
    };

    try {
      await saveAnalysis(failedAnalysis);
    } catch {
      return { status: 500, body: { message: 'The failed analysis could not be saved. Please try again.' } };
    }
    return { status: error.statusCode, body: failedAnalysis };
  }
}

export { analyzePullRequest };
