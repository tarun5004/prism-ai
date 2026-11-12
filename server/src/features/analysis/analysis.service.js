import { randomUUID, createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { runAiAnalysis, exportReviewTrace, validateFindings, validateReview } from '../ai/ai.service.js';
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

// Public sample reads only owned, committed fixtures and captured output, never private reports.
async function loadDemoReport() {
  const normalize = value => value.replace(/^\uFEFF/, '').replaceAll('\r\n', '\n');
  const raw = normalize(await readFile(new URL('../../../../docs/beta/evaluation-cases.json', import.meta.url), 'utf8'));
  const archive = JSON.parse(await readFile(new URL('../../../../docs/beta/evaluation-live-dev.json', import.meta.url), 'utf8'));
  const run = archive.demoCapture || archive;
  if (run.mode !== 'live' || run.datasetSha256 !== createHash('sha256').update(raw).digest('hex')) throw Error('Sample source mismatch');
  const fixture = JSON.parse(raw).cases.find(item => item.id === 'B01');
  const captured = run.cases.find(item => item.caseId === 'B01' && ['completed', 'partial'].includes(item.status));
  if (!fixture || !captured) throw Error('Captured sample unavailable');
  const pullRequest = { title: fixture.title, description: fixture.description, repository: 'Owned evaluation fixture', filesComplete: true,
    changedFiles: fixture.files.map(file => ({ path: file.path, status: file.oldLines.length ? 'modified' : 'added', additions: file.newLines.length, deletions: file.oldLines.length, patch: `@@ -${file.oldLines.length ? 1 : 0},${file.oldLines.length} +${file.newLines.length ? 1 : 0},${file.newLines.length} @@\n` + [...file.oldLines.map(line => '-' + line), ...file.newLines.map(line => '+' + line)].join('\n') + '\n' })) };
  const prepared = prepareAiInput(pullRequest);
  const findings = validateFindings(captured.findings, prepared.files);
  if (findings.length !== captured.findings.length || !prepared.files.length) throw Error('Sample evidence mismatch');
  const review = captured.review ? validateReview(captured.review, prepared.files, []) : null;
  if (captured.review && !review) throw Error('Sample review mismatch');
  if (review) review.recommendation = captured.review.recommendation;
  return { id: 'demo-b01', status: 'completed', createdAt: run.createdAt, pullRequest, findings: [...runRules(pullRequest), ...findings],
    aiStatus: captured.status, aiModel: captured.model, aiCoverage: prepared.coverage,
    ...(review ? { aiReview: review } : {}),
    aiDiagnostics: { durationMs: captured.durationMs, attempts: captured.attempts, timeoutMs: captured.timeoutMs, usage: captured.diagnostics?.usage || null, promptVersion: captured.diagnostics?.promptVersion, schemaVersion: captured.diagnostics?.schemaVersion, runId: captured.diagnostics?.runId },
    sample: { fixtureId: 'B01', capturedAt: run.createdAt, readOnly: true, description: 'Recorded Gemini review of an owned synthetic fixture. No new model request is made when opening this sample.' } };
}

export { analyzePullRequest, loadDemoReport };
