import { randomUUID } from 'node:crypto';
import { runAiAnalysis, exportReviewTrace } from '../ai/ai.service.js';
import { prepareAiInput, buildReviewMemory } from '../ai/ai.context.js';
import { fetchPullRequest, fetchReviewContext, PullRequestError } from '../pullRequest/pullRequest.service.js';
import { saveAnalysis, saveGitHubFeedback, findPreviousAnalysis } from './analysis.repository.js';
import { postReviewSummary } from '../pullRequest/github.app.js';
import { runRules } from './analysis.rules.js';

// Shared by manual requests and verified GitHub events.
async function analyzePullRequest(pullRequestUrl, { progress = () => {}, id = randomUUID(), trigger, expectedRevision, installationId, githubToken } = {}) {
  const pipeline = { startedAt: new Date().toISOString(), stages: [] };
  // This small wrapper records real stages; optional failures remain visible in the report.
  async function measure(name, work) {
    const stage = { name, startedAt: new Date().toISOString(), status: 'completed' };
    const started = performance.now();
    pipeline.stages.push(stage);
    try {
      const value = await work();
      if (name === 'model') stage.status = value.status === 'unavailable' ? 'failed' : value.status;
      return value;
    } catch (error) { stage.status = 'failed'; throw error; }
    finally { stage.durationMs = Math.round(performance.now() - started); }
  }
  try {
    progress('fetching');
    const pullRequest = await measure('github', () => fetchPullRequest(pullRequestUrl, { token: githubToken }));
    if (installationId && typeof pullRequest.repository === 'string') pullRequest.repository = pullRequest.repository.toLowerCase();
    if (typeof pullRequest.key === 'string') pullRequest.key = pullRequest.key.toLowerCase();
    if (expectedRevision && (pullRequest.baseSha !== expectedRevision.baseSha || pullRequest.headSha !== expectedRevision.headSha)) {
      throw new PullRequestError('PR revision changed before webhook review. Use the latest event or analyze the PR manually.', 409);
    }
    const ruleFindings = runRules(pullRequest);
    const aiEnabled = Boolean(process.env.GEMINI_API_KEY?.trim()) && prepareAiInput(pullRequest).files.length > 0;
    if (aiEnabled) progress('context');
    // Source enrichment is transient; only validated review evidence reaches storage/API.
    const reviewInput = aiEnabled
      ? { ...pullRequest, reviewContext: await measure('retrieval', () => fetchReviewContext(pullRequest, { token: githubToken })) } : pullRequest;
    if (aiEnabled) {
      try { reviewInput.reviewMemory = buildReviewMemory(await measure('memory', () => findPreviousAnalysis(pullRequest, installationId)), pullRequest); }
      catch { reviewInput.reviewMemory = null; } // Optional memory cannot discard a current review.
    }
    const aiResult = await measure('model', () => runAiAnalysis(reviewInput, { onRequest: () => progress('reviewing') }));
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
      aiDiagnostics: { ...aiResult.diagnostics, pipeline },
      ...(aiResult.review ? { aiReview: aiResult.review } : {}),
      ...(aiResult.error ? { aiError: aiResult.error } : {})
    };
    analysis.aiDiagnostics.tracing = await exportReviewTrace(analysis);

    progress('saving');
    const saved = await saveAnalysis(analysis);
    if (installationId && process.env.GITHUB_POST_REVIEW === 'true') {
      const feedback = await postReviewSummary(saved);
      try { return { status: 201, body: await saveGitHubFeedback(id, feedback) || saved }; }
      catch { return { status: 201, body: { ...saved, githubFeedback: { status: 'unavailable', errorCode: 'STATUS_SAVE_FAILED' } } }; }
    }
    return { status: 201, body: saved };
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
      aiDiagnostics: { pipeline },
      ...(trigger ? { trigger } : {}),
      error: error.message,
      errorCode: error.code
    };
    failedAnalysis.aiDiagnostics.tracing = await exportReviewTrace(failedAnalysis);

    try {
      await saveAnalysis(failedAnalysis);
    } catch {
      return { status: 500, body: { message: 'The failed analysis could not be saved. Please try again.' } };
    }
    return { status: error.statusCode, body: failedAnalysis };
  }
}

export { analyzePullRequest };
