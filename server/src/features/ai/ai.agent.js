// Private Python boundary: Node owns authorization, durable jobs and final validation.
import { z } from 'zod';
import { prepareAiInput, containsSensitiveText } from './ai.context.js';
import { validateFindings, validateReview } from './ai.service.js';

const tools = ['inspect_pr_snapshot', 'read_source_window', 'find_related_tests', 'search_review_context', 'run_review_rules'];
const count = z.number().int().min(0);
const usageSchema = z.object({ inputTokens: count.nullable(), outputTokens: count.nullable(), thinkingTokens: count.nullable(), totalTokens: count.nullable() });
const referenceSchema = z.object({ sourceId: z.string().max(30), filePath: z.string().max(500), lineSide: z.enum(['old', 'new']),
  startLine: count.positive(), endLine: count.positive(), revision: z.string().regex(/^[a-f\d]{40}$/) }).strict();
const responseSchema = z.object({ schemaVersion: z.literal('prism-agent-v1'), reviewId: z.string().max(128),
  scope: z.object({ installationId: count.positive(), repository: z.string(), number: count.positive(), baseSha: z.string(), headSha: z.string(), diffBaseSha: z.string().nullable() }).strict(),
  status: z.enum(['completed', 'partial', 'unavailable']), findings: z.array(z.unknown()).max(5), review: z.unknown().nullable(), errorCode: z.string().regex(/^[A-Z_]{1,80}$/).nullable(),
  diagnostics: z.object({ provider: z.literal('gemini'), model: z.string().min(1).max(150), provenance: z.enum(['live-provider', 'scripted-fixture', 'injected-provider']),
    promptVersion: z.string().regex(/^[a-z\d-]{1,60}$/).optional(), thinkingLevel: z.enum(['minimal', 'low', 'medium', 'high', 'provider']).optional(),
    events: z.array(z.object({ tool: z.enum(tools), status: z.enum(['ok', 'no_match', 'denied']), sources: z.array(referenceSchema).max(16), durationMs: count.max(90000) }).strict()).max(4),
    stopReason: z.string().regex(/^[a-z_]{1,60}$/), toolCalls: count.max(4), rounds: count.max(2), attempts: count.max(3),
    cost: z.object({ estimatedUsd: z.number().nonnegative().nullable(), asOf: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).nullable(), reason: z.string().max(150) }).optional(),
    requests: z.array(z.object({ stage: z.enum(['decide', 'draft']), status: z.enum(['completed', 'rejected', 'unknown']), durationMs: count,
      finishReason: z.enum(['STOP', 'MAX_TOKENS', 'SAFETY', 'OTHER']).optional(),
      usage: usageSchema.nullable(), httpStatus: count.optional() }).strict()).max(3), usage: usageSchema, durationMs: count.max(180000)
  }) }).strict();

function getReviewEngine(value = process.env.REVIEW_ENGINE || 'legacy') {
  if (!['legacy', 'python-agent'].includes(value)) throw Error('Unsupported review engine.');
  return value;
}

function privateEndpoint(value) {
  const url = new URL(value);
  const local = process.env.NODE_ENV !== 'production' && ['127.0.0.1', 'localhost', '[::1]'].includes(url.hostname);
  const internal = /^[a-z\d-]+\.internal\.[a-z\d-]+\.[a-z\d-]+\.azurecontainerapps\.io$/.test(url.hostname);
  if ((!local && !internal) || !['http:', 'https:'].includes(url.protocol) || (!local && url.protocol !== 'https:')
    || url.username || url.password || url.search || url.hash || url.pathname !== '/') throw Error('Configure a private HTTPS agent endpoint.');
  return new URL('/v1/reviews', url).href;
}

function prepareAgentRequest(pullRequest, { id, installationId, ruleFindings = [] }) {
  if (!Number.isSafeInteger(installationId) || installationId < 1 || !/^[a-z\d_-]{1,128}$/i.test(id || '')) throw Error('Agent scope requires an authorized review.');
  const number = pullRequest.number || Number(pullRequest.url?.match(/\/pull\/(\d+)\/?$/)?.[1]);
  const scope = { installationId, repository: pullRequest.repository?.toLowerCase(), number,
    baseSha: pullRequest.baseSha, headSha: pullRequest.headSha, diffBaseSha: pullRequest.diffBaseSha || null };
  if (!/^[a-z\d-]+\/[a-z\d_.-]+$/.test(scope.repository || '') || !Number.isSafeInteger(number) || number < 1
    || ![scope.baseSha, scope.headSha, scope.diffBaseSha || scope.baseSha].every(sha => /^[a-f\d]{40}$/.test(sha || ''))) throw Error('Invalid agent revision.');
  const prepared = prepareAiInput(pullRequest);
  const sources = prepared.snippets.slice(0, 16).map((source, index) => {
    const original = pullRequest.reviewContext?.snippets?.find(item => item.filePath === source.filePath && item.lineSide === source.lineSide && item.startLine === source.startLine);
    return { ...source, sourceId: `source-${index + 1}`, revision: source.lineSide === 'old' ? scope.diffBaseSha || scope.baseSha : scope.headSha,
      relatedTo: (original?.relatedTo || []).filter(path => prepared.files.some(file => file.filePath === path)).slice(0, 5) };
  });
  const rules = ruleFindings.slice(0, 20).map(rule => ({ category: String(rule.category || 'rule').slice(0, 80), severity: rule.severity,
    explanation: String(rule.explanation || '').slice(0, 1500), affectedFiles: (rule.affectedFiles || []).filter(path => prepared.files.some(file => file.filePath === path)).slice(0, 5) }))
    .filter(rule => ['high', 'medium', 'low'].includes(rule.severity) && !containsSensitiveText(JSON.stringify(rule)));
  return { schemaVersion: 'prism-agent-v1', reviewId: id, scope, intent: prepared.intent, files: prepared.files, sources, rules,
    coverage: { ...prepared.coverage, filesComplete: pullRequest.filesComplete !== false }, memory: prepared.memory };
}

const interrupted = () => Object.assign(Error('Agent request outcome is uncertain; automatic replay is blocked.'), { code: 'INTERRUPTED_MODEL_REQUEST' });

async function readResponse(response) {
  const reader = response.body?.getReader();
  if (!reader) throw Error('Missing agent response.');
  const chunks = []; let bytes = 0;
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      bytes += value.length;
      if (bytes > 128 * 1024) { await reader.cancel(); throw Error('Agent response exceeds its limit.'); }
      chunks.push(Buffer.from(value));
    }
    return JSON.parse(Buffer.concat(chunks).toString('utf8'));
  } finally { reader.releaseLock(); }
}

function validateAgentResult(raw, snapshot) {
  const data = responseSchema.parse(raw);
  if (data.reviewId !== snapshot.reviewId || Object.keys(snapshot.scope).some(key => data.scope[key] !== snapshot.scope[key])) throw Error('Agent scope mismatch.');
  const diagnostic = data.diagnostics;
  if (diagnostic.requests.length !== diagnostic.attempts || diagnostic.events.length !== diagnostic.toolCalls) throw Error('Agent budget mismatch.');
  const selected = [];
  for (const event of diagnostic.events) for (const ref of event.sources) {
    const source = snapshot.sources.find(item => item.sourceId === ref.sourceId);
    if (!source || ['filePath', 'lineSide', 'revision'].some(key => ref[key] !== source[key])
      || ref.startLine < source.startLine || ref.endLine < ref.startLine || ref.endLine >= source.startLine + source.code.split('\n').length) throw Error('Agent evidence scope mismatch.');
    selected.push({ ...source, startLine: ref.startLine, code: source.code.split('\n').slice(ref.startLine - source.startLine, ref.endLine - source.startLine + 1).join('\n') });
  }
  const findings = validateFindings(data.findings, snapshot.files);
  const review = data.review ? validateReview(data.review, snapshot.files, selected) : null;
  const invalid = findings.length !== data.findings.length || (data.review && !review) || (data.status === 'completed' && !review);
  return { status: invalid ? (findings.length ? 'partial' : 'unavailable') : data.status, findings, review,
    error: invalid ? 'AGENT_EVIDENCE_INVALID' : data.errorCode || undefined, model: diagnostic.model, provider: diagnostic.provider,
    coverage: snapshot.coverage,
    diagnostics: { schemaVersion: 'prism-agent-v1', promptVersion: diagnostic.promptVersion || 'bounded-agent-v1', attempts: diagnostic.attempts,
      durationMs: diagnostic.durationMs, timeoutMs: 150000, usage: diagnostic.usage, agent: diagnostic } };
}

async function runAgentAnalysis(pullRequest, options) {
  const unavailable = error => ({ status: 'unavailable', findings: [], model: 'python-agent', provider: 'gemini', error,
    coverage: prepareAiInput(pullRequest).coverage, diagnostics: { agent: { provenance: 'not-started', events: [], stopReason: error, attempts: 0 } } });
  let snapshot, endpoint, token;
  try {
    endpoint = privateEndpoint(options.endpoint || process.env.PRISM_AGENT_URL);
    token = options.token || process.env.PRISM_AGENT_SERVICE_TOKEN;
    if (typeof token !== 'string' || token.length < 32) throw Error('Missing service credential.');
    snapshot = prepareAgentRequest(pullRequest, options);
    if (!snapshot.files.length || Buffer.byteLength(JSON.stringify(snapshot)) > 256 * 1024) throw Error('No safe bounded input.');
  } catch { return unavailable('AGENT_CONFIGURATION'); }
  let response, raw;
  try {
    options.onRequest?.();
    response = await (options.request || fetch)(endpoint, { method: 'POST', redirect: 'error', signal: AbortSignal.timeout(150000),
      headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' }, body: JSON.stringify(snapshot) });
    raw = await readResponse(response);
  } catch { throw interrupted(); }
  if (raw?.errorCode === 'MODEL_REQUEST_UNCERTAIN' || (response.status >= 500 && raw?.errorCode !== 'MODEL_UNAVAILABLE')) throw interrupted();
  if (!response.ok) return unavailable('AGENT_REJECTED');
  try { return validateAgentResult(raw, snapshot); }
  catch { return unavailable('AGENT_RESPONSE_INVALID'); }
}

export { getReviewEngine, prepareAgentRequest, runAgentAnalysis };
