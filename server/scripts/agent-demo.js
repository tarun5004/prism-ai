// Owned local fixture only: real Node -> HTTP -> FastAPI -> LangGraph -> saved report.
// GitHub/provider I/O is substituted explicitly; no .env is loaded or modified.
import assert from 'node:assert/strict';
const port = Number(process.env.PRISM_FIXTURE_PORT || 5055);
Object.assign(process.env, { NODE_ENV: 'development', GITHUB_APP_ID: '', REVIEW_ENGINE: 'python-agent', REVIEW_EXECUTION: 'inline',
  DEMO_ONLY: 'false', EMAIL_ENABLED: 'false', REVIEW_REPOSITORY_CONFIG: 'false', SEMANTIC_RETRIEVAL: 'false', REVIEW_GUIDANCE: 'off',
  GITHUB_POST_REVIEW: 'true', GITHUB_POST_INLINE: 'true', GITHUB_POST_STATUS: 'true', LANGFUSE_ENABLED: 'false',
  PRISM_AGENT_URL: 'http://127.0.0.1:8090', PRISM_AGENT_SERVICE_TOKEN: 'local-fixture-service-token-not-secret', APP_ORIGIN: `http://127.0.0.1:${port}` });
const originalFetch = globalThis.fetch;
const baseSha = '1'.repeat(40), headSha = '2'.repeat(40);
const evidence = 'return !isDraft || !reviewsPaused;';
globalThis.fetch = async (address, init) => {
  const url = new URL(address);
  if (url.origin === process.env.PRISM_AGENT_URL) return originalFetch(address, init);
  if (url.origin !== 'https://api.github.com' || init?.method === 'POST') throw Error('Fixture blocked external request.');
  if (url.pathname.includes('/contents/')) {
    const path = decodeURIComponent(url.pathname.split('/contents/')[1]);
    const code = path === 'src/policy.js' ? '// Owned fixture\n// 2\n// 3\n// 4\n// 5\n// 6\n' + evidence
      : ['src/policy.test.js', 'test/policy.test.js'].includes(path) ? '// Draft PRs must not run.\nexpect(shouldAutoReview({isDraft:true,reviewsPaused:false})).toBe(false);' : null;
    return code === null ? Response.json({}, { status: 404 }) : Response.json({ encoding: 'base64', size: code.length, content: Buffer.from(code).toString('base64') });
  }
  if (url.pathname.endsWith('/files')) return Response.json([{ filename: 'src/policy.js', status: 'added', additions: 1, deletions: 0, patch: '@@ -6,0 +7,1 @@\n+' + evidence + '\n' }]);
  return Response.json({ number: 7, title: 'Owned agent fixture: review eligibility', html_url: 'https://github.com/example/prism-demo/pull/7', changed_files: 1,
    state: 'open', base: { sha: baseSha, ref: 'main' }, head: { sha: headSha, ref: 'fixture' } });
};
const { analyzePullRequest } = await import('../src/features/analysis/analysis.service.js');
const result = await analyzePullRequest('https://github.com/example/prism-demo/pull/7', { id: 'agent-local-fixture', installationId: 1,
  githubToken: 'owned-fixture-token', reviewEngine: 'python-agent' });
assert.equal(result.status, 201);
assert.equal(result.body.aiStatus, 'completed', JSON.stringify({ error: result.body.aiError,
  stop: result.body.aiDiagnostics?.agent?.stopReason, omissions: result.body.aiCoverage?.contextOmissions }));
assert.equal(result.body.aiDiagnostics.agent.provenance, 'scripted-fixture');
assert.equal(result.body.aiDiagnostics.agent.events[0].tool, 'find_related_tests');
assert.equal(result.body.publication.status, 'pending');
assert.equal(result.body.githubInline, undefined); assert.equal(result.body.githubFeedback, undefined); assert.equal(result.body.githubStatus, undefined);
const { default: app } = await import('../src/app.js');
app.listen(port, '127.0.0.1', () => console.log(`Scripted fixture verified. Local UI: http://127.0.0.1:${port}/analyses/agent-local-fixture (GitHub writes disabled by agent policy; real approval requires a session).`));
