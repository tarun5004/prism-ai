import { randomUUID, createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { getAiConfiguration, runAiAnalysis, exportReviewTrace, validateFindings, validateReview } from '../ai/ai.service.js';
import { prepareAiInput, buildReviewMemory } from '../ai/ai.context.js';
import { fetchPullRequest, fetchReviewContext, fetchRepositoryPolicy, fetchIncrementalReview, PullRequestError } from '../pullRequest/pullRequest.service.js';
import { applyReviewPolicy } from '../pullRequest/review.policy.js';
import { saveAnalysis, saveGitHubFeedback, findPreviousAnalysis, findAnalysis } from './analysis.repository.js';
import { postReviewSummary } from '../pullRequest/github.app.js';
import { runRules } from './analysis.rules.js';
import { sendReviewEmail } from './analysis.mail.js';
import { retrieveSemanticContext } from '../ai/ai.retrieval.js';

// Shared by manual requests and verified GitHub events.
async function analyzePullRequest(pullRequestUrl, { progress = () => {}, id = randomUUID(), trigger, expectedRevision, installationId, githubToken, notificationUserId, resume = false } = {}) {
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
    let pullRequest = await measure('github', () => fetchPullRequest(pullRequestUrl, { token: githubToken }));
    if (installationId && typeof pullRequest.repository === 'string') pullRequest.repository = pullRequest.repository.toLowerCase();
    if (typeof pullRequest.key === 'string') pullRequest.key = pullRequest.key.toLowerCase();
    if (expectedRevision && (pullRequest.baseSha !== expectedRevision.baseSha || pullRequest.headSha !== expectedRevision.headSha)) {
      throw new PullRequestError('PR revision changed before webhook review. Use the latest event or analyze the PR manually.', 409);
    }
    pullRequest.reviewScope = { mode: 'full' };
    if (trigger?.action === 'synchronize' || trigger?.command === 'review') {
      let previous;
      try { previous = await findPreviousAnalysis(pullRequest, installationId, { successfulOnly: true }); } catch { /* Full diff remains safe if history is unavailable. */ }
      pullRequest = await measure('incremental', () => fetchIncrementalReview(pullRequest, previous, { installationId, token: githubToken }));
    }
    if (process.env.REVIEW_REPOSITORY_CONFIG === 'true') {
      const policy = await measure('policy', () => fetchRepositoryPolicy(pullRequest, { token: githubToken }));
      if (trigger?.type === 'github_webhook' && !trigger.command && !policy.autoReview) return { status: 200, body: { status: 'skipped', reason: 'auto-review-disabled' } };
      pullRequest = applyReviewPolicy(pullRequest, policy);
    }
    const ruleFindings = runRules(pullRequest);
    const aiEnabled = Boolean(getAiConfiguration().apiKey) && prepareAiInput(pullRequest).files.length > 0;
    let reviewInput = pullRequest;
    const { runReviewWorkflow } = await import('./analysis.workflow.js');
    return await runReviewWorkflow({ id, repository: pullRequest.repository, baseSha: pullRequest.baseSha, headSha: pullRequest.headSha, installationId, resume,
      load: async () => ({ status: 201, body: await findAnalysis(id) }),
      prepare: async () => {
        if (aiEnabled) progress('context');
        // Source enrichment is transient; only validated review evidence reaches storage/API.
        reviewInput = aiEnabled
          ? { ...pullRequest, reviewContext: await measure('retrieval', async () => {
            const context = await fetchReviewContext(pullRequest, { token: githubToken });
            return retrieveSemanticContext({ ...pullRequest, reviewContext: context }, { installationId });
          }) } : pullRequest;
        if (aiEnabled) {
          try { reviewInput.reviewMemory = buildReviewMemory(await measure('memory', () => findPreviousAnalysis(pullRequest, installationId)), pullRequest); }
          catch { reviewInput.reviewMemory = null; } // Optional memory cannot discard a current review.
        }
      },
      review: () => measure('model', () => runAiAnalysis(reviewInput, { onRequest: () => progress('reviewing') })),
      save: async aiResult => {
        // The report may already exist if the process stopped after its insert.
        const existing = await findAnalysis(id);
        if (existing) return { status: 201, body: existing };
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
          aiProvider: aiResult.provider,
          aiCoverage: aiResult.coverage,
          aiDiagnostics: { ...aiResult.diagnostics, pipeline, workflow: { engine: 'langgraph', checkpoint: 'review-v1' } },
          ...(aiResult.review ? { aiReview: aiResult.review } : {}),
          ...(aiResult.error ? { aiError: aiResult.error } : {})
        };
        analysis.aiDiagnostics.tracing = await exportReviewTrace(analysis);

        progress('saving');
        const saved = await saveAnalysis(analysis);
        saved.emailNotification = await sendReviewEmail(saved, notificationUserId || trigger?.actorId);
        if (installationId && process.env.GITHUB_POST_REVIEW === 'true') {
          const feedback = await postReviewSummary(saved);
          try { return { status: 201, body: await saveGitHubFeedback(id, feedback) || saved }; }
          catch { return { status: 201, body: { ...saved, githubFeedback: { status: 'unavailable', errorCode: 'STATUS_SAVE_FAILED' } } }; }
        }
        return { status: 201, body: saved };
      }
    });
  } catch (error) {
    if (!(error instanceof PullRequestError)) {
      return { status: 500, body: { message: 'Analysis could not be saved or completed. Please try again.', ...(error.code === 'INTERRUPTED_MODEL_REQUEST' ? { errorCode: error.code } : {}) } };
    }
    if (error.statusCode === 400) return { status: 400, body: { message: error.message } };
    // A temporary GitHub failure must not replace a recoverable checkpoint with a failed report.
    if (resume) return { status: error.statusCode, body: { message: error.message, errorCode: error.code } };
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
