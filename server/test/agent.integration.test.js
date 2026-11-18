import test from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import mongoose from 'mongoose';
import Analysis, { ReviewJob } from '../src/features/analysis/analysis.model.js';
import { enqueueReviewJob, findReviewJob, claimReviewJob, markReviewJobUnknown, saveAnalysis, findAnalysis } from '../src/features/analysis/analysis.repository.js';
import { initializePublication, publishApprovedSummary } from '../src/features/analysis/analysis.publication.js';
import { runReviewWorkflow } from '../src/features/analysis/analysis.workflow.js';

test('real Mongo persists engine/agent metadata, atomically claims publication and blocks model replay', { skip: process.env.INTEGRATION_TESTS !== 'true', timeout: 30000 }, async () => {
  const database = 'prism_agent_integration_' + randomUUID().replaceAll('-', '');
  try {
    await mongoose.connect(`mongodb://${process.env.TEST_MONGODB_HOST || '127.0.0.1'}:27017/${database}`, { serverSelectionTimeoutMS: 3000 });
    await Promise.all([ReviewJob.init(), Analysis.init()]);
    const id = 'webhook-' + 'd'.repeat(64);
    await enqueueReviewJob({ id, payload: { options: { reviewEngine: 'python-agent' } } });
    await enqueueReviewJob({ id, payload: { options: { reviewEngine: 'legacy', trigger: { type: 'manual' } } } });
    assert.equal((await findReviewJob(id)).payload.options.reviewEngine, 'python-agent');
    const claims = await Promise.all([claimReviewJob(id, 'one'), claimReviewJob(id, 'two')]);
    assert.equal(claims.filter(Boolean).length, 1);
    const owner = claims.find(Boolean).owner;
    await markReviewJobUnknown(id, 'wrong', 'INTERRUPTED_MODEL_REQUEST');
    assert.equal((await findReviewJob(id)).status, 'running');
    await markReviewJobUnknown(id, owner, 'INTERRUPTED_MODEL_REQUEST');
    assert.equal((await findReviewJob(id)).status, 'unknown');
    const oldId = 'webhook-' + 'c'.repeat(64);
    await ReviewJob.create({ id: oldId, status: 'queued', payload: { options: {} } });
    await enqueueReviewJob({ id: oldId, payload: { options: { reviewEngine: 'python-agent', trigger: { type: 'manual' } } } });
    assert.equal((await findReviewJob(oldId)).payload.options.reviewEngine, 'legacy', 'Pre-feature jobs cannot silently change engines');

    const report = { id: 'agent-persisted', installationId: 7, status: 'completed', aiStatus: 'partial', findings: [], createdAt: new Date().toISOString(),
      aiDiagnostics: { agent: { provenance: 'scripted-fixture', events: [], cost: { estimatedUsd: null } } },
      pullRequest: { url: 'https://github.com/owned/demo/pull/5', repository: 'owned/demo', baseSha: 'a'.repeat(40), headSha: 'b'.repeat(40) } };
    report.publication = initializePublication(report, 'https://prism.example');
    await saveAnalysis(report);
    assert.equal((await findAnalysis(report.id)).aiDiagnostics.agent.provenance, 'scripted-fixture');
    let posts = 0;
    const dependencies = { origin: 'https://prism.example', appId: '7', getToken: async () => 'fixture-installation-token', request: async (path, token, options) => {
      if (path === '/repos/owned/demo') return { permissions: { push: true } };
      if (path.includes('/pulls/')) return { state: 'open', base: { sha: 'a'.repeat(40) }, head: { sha: 'b'.repeat(40) } };
      if (options?.body) { posts++; return { id: 101 }; }
      return [];
    } };
    const auth = { userId: '42', token: 'fixture-user-token', repositories: [{ installationId: 7, repository: 'owned/demo' }] };
    await Promise.all([publishApprovedSummary(report, auth, 'approve', dependencies), publishApprovedSummary(report, auth, 'approve', dependencies)]);
    assert.equal(posts, 1); assert.equal((await findAnalysis(report.id)).publication.status, 'published');

    const scope = { id: 'agent-interrupted-checkpoint', installationId: 7, repository: 'owned/demo', baseSha: 'a', headSha: 'b' };
    let modelCalls = 0;
    const options = { ...scope, prepare: async () => {}, review: async () => { modelCalls++; throw Object.assign(Error('Owned interrupted fixture'), { code: 'INTERRUPTED_MODEL_REQUEST' }); }, save: () => assert.fail('No result to save'), load: () => assert.fail('No saved report') };
    await assert.rejects(runReviewWorkflow(options), { code: 'INTERRUPTED_MODEL_REQUEST' });
    await assert.rejects(runReviewWorkflow({ ...options, resume: true }), { code: 'INTERRUPTED_MODEL_REQUEST' });
    assert.equal(modelCalls, 1);
  } finally {
    // Only this test's random isolated database can be dropped.
    if (mongoose.connection.name === database && database.startsWith('prism_agent_integration_')) await mongoose.connection.dropDatabase();
    await mongoose.disconnect();
  }
});
