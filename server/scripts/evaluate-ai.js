import { createHash, randomUUID } from 'node:crypto';
import { open, readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { config } from 'dotenv';
import { prepareAiInput } from '../src/features/ai/ai.context.js';
import { runAiAnalysis } from '../src/features/ai/ai.service.js';

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
    else if (names[flag]) {
      const value = args[++index];
      if (!value || value.startsWith('--')) throw Error('Missing value: ' + flag);
      options[names[flag]] = value;
    } else throw Error('Unknown option: ' + flag);
  }
  if (!options.outPath) throw Error('--out requires a new output file.');
  if (options.caseId && options.split) throw Error('Choose --case or --split, not both.');
  if (options.live && !options.caseId && !options.split) throw Error('--live requires explicit --case or --split selection.');
  if (options.split && !['dev', 'heldout'].includes(options.split)) throw Error('Use dev or heldout split.');
  return options;
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
  const output = await open(options.outPath, 'wx');
  const save = async () => {
    const bytes = Buffer.from(JSON.stringify(run, null, 2) + '\n');
    let offset = 0;
    while (offset < bytes.length) {
      const { bytesWritten } = await output.write(bytes, offset, bytes.length - offset, offset);
      offset += bytesWritten;
    }
    await output.truncate(bytes.length);
    await output.sync();
  };
  try {
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
            errorCode: result.error || null
          });
        } catch {
          Object.assign(record, { status: 'unavailable', errorCode: 'COLLECTOR_ERROR', durationMs: Math.round(performance.now() - started) });
        }
        await save();
      }
    }
    return run;
  } finally { await output.close(); }
}

async function main() {
  try {
    const options = parseOptions(process.argv.slice(2));
    if (options.live) {
      config({ path: fileURLToPath(new URL('../.env', import.meta.url)), quiet: true });
      if (!process.env.GEMINI_API_KEY?.trim()) throw Error('GEMINI_API_KEY is required for --live. No requests made.');
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
export { collectEvaluation, parseOptions, toPullRequest };
