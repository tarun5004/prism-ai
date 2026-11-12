import { createHash, randomUUID } from 'node:crypto';
import { open, readFile, rename, unlink } from 'node:fs/promises';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { config } from 'dotenv';
import { prepareAiInput } from '../src/features/ai/ai.context.js';
import { runAiAnalysis } from '../src/features/ai/ai.service.js';
import { rankGuidance, containsSensitiveText } from '../src/features/ai/ai.context.js';
import { GoogleGenAI } from '@google/genai';

const datasetPath = fileURLToPath(new URL('../../docs/beta/evaluation-cases.json', import.meta.url));
const normalize = value => value.replace(/^\uFEFF/, '').replaceAll('\r\n', '\n');
const hash = value => createHash('sha256').update(normalize(value)).digest('hex');

function parseOptions(args) {
  const options = { live: false };
  const names = { '--out': 'outPath', '--case': 'caseId', '--split': 'split' };
  const seen = new Set();
  for (let index = 0; index < args.length; index++) {
    const flag = args[index];
    if (seen.has(flag)) throw Error('Duplicate option: ' + flag);
    seen.add(flag);
    if (flag === '--live') options.live = true;
    else if (flag === '--retrieval-experiment') options.retrieval = true;
    else if (flag === '--semantic') options.semantic = true;
    else if (names[flag]) {
      const value = args[++index];
      if (!value || value.startsWith('--')) throw Error('Missing value: ' + flag);
      options[names[flag]] = value;
    } else throw Error('Unknown option: ' + flag);
  }
  if (!options.outPath) throw Error('--out requires a new output file.');
  if (options.semantic && !options.retrieval) throw Error('--semantic requires --retrieval-experiment.');
  if (options.retrieval && (options.live || options.caseId || options.split)) throw Error('Retrieval experiment cannot select review generation.');
  if (options.caseId && options.split) throw Error('Choose --case or --split, not both.');
  if (options.live && !options.caseId && !options.split) throw Error('--live requires explicit --case or --split selection.');
  if (options.split && !['dev', 'heldout'].includes(options.split)) throw Error('Use dev or heldout split.');
  return options;
}

async function compareRetrieval(dataset, embed) {
  const docs = dataset.documents;
  const queries = dataset.queries;
  if (!Array.isArray(docs) || !docs.length || docs.length > 20 || !Array.isArray(queries) || !queries.length || queries.length > 20
    || JSON.stringify(dataset).length > 12000 || docs.some(doc => !['id', 'path', 'revision', 'text'].every(key => typeof doc[key] === 'string' && doc[key]) || !Number.isSafeInteger(doc.startLine) || doc.startLine < 1)
    || new Set(docs.map(doc => doc.id)).size !== docs.length
    || queries.some(query => typeof query.text !== 'string' || !Array.isArray(query.relevant) || !query.relevant.length || query.relevant.some(id => !docs.some(doc => doc.id === id)))
    || containsSensitiveText(JSON.stringify(dataset))) throw Error('Invalid retrieval fixtures.');
  const measure = selections => ({ hitAt1: selections.filter((id, index) => queries[index].relevant.includes(id)).length / queries.length, selectedSources: selections });
  const lexical = measure(queries.map(query => docs.map(doc => ({ id: doc.id, score: rankGuidance(doc.text, query.text)[0]?.score || 0 })).sort((a, b) => b.score - a.score)[0]).map(item => item.score > 0 ? item.id : null));
  let semantic = null;
  if (embed) {
    const documentVectors = await embed(docs.map(doc => doc.text), 'RETRIEVAL_DOCUMENT');
    const queryVectors = await embed(queries.map(query => query.text), 'RETRIEVAL_QUERY');
    const dimensions = documentVectors?.[0]?.length;
    if (!dimensions || documentVectors?.length !== docs.length || queryVectors?.length !== queries.length
      || [...documentVectors, ...queryVectors].some(vector => !Array.isArray(vector) || vector.length !== dimensions || !vector.every(Number.isFinite) || !vector.some(value => value !== 0))) throw Error('Invalid embedding response.');
    const cosine = (a, b) => a.reduce((sum, value, index) => sum + value * b[index], 0) / Math.hypot(...a) / Math.hypot(...b);
    semantic = measure(queryVectors.map(query => docs.map((doc, index) => ({ id: doc.id, score: cosine(query, documentVectors[index]) })).sort((a, b) => b.score - a.score)[0].id));
  }
  return { queries: queries.length, lexical, semantic, sources: docs.map(({ text, ...source }) => source), limits: 'Small synthetic relevance fixture, not PR review accuracy or evidence of improved production retrieval.' };
}

async function collectRetrievalEvaluation(options) {
  const raw = await readFile(new URL('../../docs/beta/retrieval-cases.json', import.meta.url), 'utf8');
  const dataset = JSON.parse(normalize(raw));
  const run = { runId: randomUUID(), createdAt: new Date().toISOString(), datasetVersion: dataset.version, datasetSha256: hash(raw), mode: options.semantic ? 'live-embeddings' : 'offline-lexical', semanticStatus: 'not_requested', attempts: 0 };
  const reservation = await open(options.outPath, 'wx'); await reservation.close();
  run.results = await compareRetrieval(dataset);
  await saveRun(options.outPath, run);
  if (options.semantic) {
    run.model = process.env.GEMINI_EMBEDDING_MODEL?.trim() || 'gemini-embedding-001';
    const client = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY, vertexai: false, httpOptions: { timeout: 20000, retryOptions: { attempts: 1 } } });
    try {
      run.semanticStatus = 'interrupted'; await saveRun(options.outPath, run);
      run.results = await compareRetrieval(dataset, async (contents, taskType) => {
        run.attempts++; await saveRun(options.outPath, run);
        const result = await client.models.embedContent({ model: run.model, contents, config: { taskType, outputDimensionality: 768, abortSignal: AbortSignal.timeout(20000) } });
        return result.embeddings?.map(item => item.values);
      });
      run.semanticStatus = 'completed';
    } catch (error) { run.semanticStatus = 'unavailable'; run.errorCode = 'EMBEDDING_FAILED'; if (Number.isInteger(error.status) && error.status >= 400 && error.status <= 599) run.httpStatus = error.status; }
    await saveRun(options.outPath, run);
  }
  return run;
}

async function saveRun(path, run, replaceFile = rename) {
  const temporaryPath = path + '.' + randomUUID() + '.tmp';
  const content = JSON.stringify(run, null, 2) + '\n';
  let temporary;
  let created = false;
  try {
    temporary = await open(temporaryPath, 'wx');
    created = true;
    await temporary.writeFile(content);
    await temporary.sync();
    await temporary.close();
    temporary = null;
    for (let attempt = 0; ; attempt++) {
      try { await replaceFile(temporaryPath, path); break; }
      catch (error) {
        // Indexers can briefly lock files on Windows. Retry the rename, never inference.
        if (!['EPERM', 'EBUSY', 'EACCES'].includes(error.code) || attempt >= 3) throw error;
        await new Promise(resolve => setTimeout(resolve, 25 * 2 ** attempt));
      }
    }
  } finally {
    if (temporary) await temporary.close();
    if (created) await unlink(temporaryPath).catch(error => { if (error.code !== 'ENOENT') throw error; });
  }
}

function toPullRequest(item) {
  // The model receives only frozen code/contracts, never bug labels or case/split IDs.
  return {
    title: item.title, description: item.description || '', filesComplete: true,
    changedFiles: item.files.map(file => ({
      path: file.path,
      status: file.oldLines.length === 0 ? 'added' : file.newLines.length === 0 ? 'removed' : 'modified',
      additions: file.newLines.length, deletions: file.oldLines.length,
      patch: `@@ -${file.oldLines.length ? 1 : 0},${file.oldLines.length} +${file.newLines.length ? 1 : 0},${file.newLines.length} @@\n`
        + [...file.oldLines.map(line => '-' + line), ...file.newLines.map(line => '+' + line)].join('\n') + '\n'
    }))
  };
}

async function collectEvaluation(options, analyze = runAiAnalysis) {
  if (!options.outPath) throw Error('Output file is required.');
  if (options.live && !options.caseId && !options.split) throw Error('Live selection must be explicit.');
  if (options.caseId && options.split) throw Error('Choose case or split, not both.');
  const raw = await readFile(datasetPath, 'utf8');
  const dataset = JSON.parse(normalize(raw));
  if (dataset.schemaVersion !== 1 || !Array.isArray(dataset.cases)) throw Error('Invalid dataset.');
  const selected = dataset.cases.filter(item => options.caseId ? item.id === options.caseId : item.split === (options.split || 'dev'));
  if (!selected.length) throw Error('Unknown or empty evaluation selection.');
  const inputs = selected.map(item => {
    if (!Array.isArray(item.files) || !item.files.length || item.files.some(file => typeof file.path !== 'string'
      || !['oldLines', 'newLines'].every(key => Array.isArray(file[key]) && file[key].every(line => typeof line === 'string' && !/[\r\n]/.test(line))))) throw Error('Invalid fixture source.');
    const input = toPullRequest(item);
    if (!prepareAiInput(input).files.length) throw Error('Fixture has no reviewable code: ' + item.id);
    return input;
  });
  const sourceHashes = {};
  for (const [key, path] of [['aiServiceSha256', '../src/features/ai/ai.service.js'], ['aiContextSha256', '../src/features/ai/ai.context.js']]) {
    sourceHashes[key] = hash(await readFile(new URL(path, import.meta.url), 'utf8'));
  }
  const run = {
    schemaVersion: 1, runId: randomUUID(), createdAt: new Date().toISOString(),
    mode: options.live ? 'live' : 'dry-run', datasetVersion: dataset.version, datasetSha256: hash(raw),
    split: selected[0].split, caseIds: selected.map(item => item.id),
    engine: { ...sourceHashes, configuredModel: process.env.GEMINI_MODEL?.trim() || null },
    cases: selected.map(item => ({ caseId: item.id, status: 'not_run', findings: [], attempts: 0, durationMs: null, rejectedFindings: 0 })),
    judgments: [],
    note: 'Original synthetic fixtures. Dry-run makes no model calls. Human judgments are required before claiming semantic accuracy.'
  };
  // Exclusive create protects a previous experiment. Save each case so a later failure cannot erase it.
  const reservation = await open(options.outPath, 'wx');
  await reservation.close();
  const save = () => saveRun(options.outPath, run);
  await save();
  if (options.live) {
    for (const [index, input] of inputs.entries()) {
      const record = run.cases[index];
      Object.assign(record, { status: 'unavailable', errorCode: 'INTERRUPTED' });
      await save();
      const started = performance.now();
      try {
        const result = await analyze(input);
        if (!['completed', 'partial', 'unavailable', 'skipped'].includes(result?.status) || !Array.isArray(result.findings)) throw Error('Invalid analysis result');
        Object.assign(record, {
          status: result.status, findings: result.findings, model: result.model || null,
          attempts: result.diagnostics?.attempts || 0, durationMs: Math.round(performance.now() - started),
          timeoutMs: result.diagnostics?.timeoutMs || null,
          rejectedFindings: result.coverage?.rejectedFindings || 0,
          errorCode: result.error || null,
          diagnostics: result.diagnostics || null,
          review: result.review || null
        });
      } catch {
        Object.assign(record, { status: 'unavailable', errorCode: 'COLLECTOR_ERROR', durationMs: Math.round(performance.now() - started) });
      }
      await save();
      if (record.diagnostics?.httpStatus === 429) { run.stopReason = 'RATE_LIMIT'; await save(); break; }
    }
  }
  return run;
}

async function main() {
  try {
    const options = parseOptions(process.argv.slice(2));
    if (options.live || options.semantic) {
      config({ path: fileURLToPath(new URL('../.env', import.meta.url)), quiet: true });
      if (!process.env.GEMINI_API_KEY?.trim()) throw Error('GEMINI_API_KEY is required for --live. No requests made.');
    }
    if (options.retrieval) {
      const run = await collectRetrievalEvaluation(options);
      process.stdout.write(JSON.stringify({ runId: run.runId, mode: run.mode, semanticStatus: run.semanticStatus, attempts: run.attempts }) + '\n');
      if (options.semantic && run.semanticStatus !== 'completed') process.exitCode = 1;
      return;
    }
    const run = await collectEvaluation(options);
    process.stdout.write(JSON.stringify({ runId: run.runId, mode: run.mode, selectedCases: run.caseIds.length, unsuccessfulCases: run.cases.filter(item => ['unavailable', 'skipped'].includes(item.status)).length }) + '\n');
    if (options.live && run.cases.some(item => ['unavailable', 'skipped'].includes(item.status))) process.exitCode = 1;
  } catch (error) {
    // No provider stack, environment values or authorization headers in CLI output.
    process.stderr.write(error?.code === 'EEXIST' ? 'Output already exists; use a new run file.\n' : 'Evaluation collection stopped: ' + error.message + '\n');
    process.exitCode = 1;
  }
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) await main();
export { collectEvaluation, parseOptions, saveRun, toPullRequest, compareRetrieval };
