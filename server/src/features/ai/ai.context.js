const codeFile = /\.(?:[cm]?[jt]sx?|py|java|go|rs|rb|php|cs|c|cpp|h|sql|sh)$/i;
const sensitivePath = /(^|\/)(?:\.env(?:\.[^/]*)?|[^/]*(?:secret|credential|private[-_]?key)[^/]*)(\/|$)|\.(?:pem|key)$/i;
const shellCredential = /^[+-]?\s*(?:export\s+)?[\w]*(?:KEY|TOKEN|SECRET|PASSWORD|CREDENTIAL)[\w]*\s*=\s*\S+/im;
const credentialText = /-----BEGIN [\w ]*PRIVATE KEY-----|AIza[\w-]{20,}|gh[pousr]_[\w]{20,}|github_pat_[\w]{20,}|(?:AKIA|ASIA)[A-Z0-9]{16}|xox[baprs]-[\w-]{20,}|\beyJ[\w-]+\.[\w-]+\.[\w-]+|[a-z][\w+.-]*:\/\/[^\s/:@]+:[^\s/@]+@|(?:api[_-]?key|access[_-]?token|auth[_-]?token|(?:client[_-]?)?secret|password|authorization|private[_-]?key)["']?\s*[:=]\s*["'`][^"'`\r\n]+["'`]/i;

// Only numbered diff lines may become evidence; malformed ranges never get guessed.
function readPatch(patch) {
  const lines = [];
  let hunk;
  let incomplete = false;
  const source = patch.split(/\r?\n/);
  if (source.at(-1) === '') source.pop();

  for (const text of source) {
    const header = text.match(/^@@ -(\d+)(?:,(\d+))? \+(\d+)(?:,(\d+))? @@.*$/);
    if (header) {
      if (hunk && (hunk.oldRemaining || hunk.newRemaining)) incomplete = true;
      const [oldNumber, oldRemaining, newNumber, newRemaining] = [Number(header[1]), Number(header[2] ?? 1), Number(header[3]), Number(header[4] ?? 1)];
      if (![oldNumber, oldRemaining, newNumber, newRemaining].every(Number.isSafeInteger) ||
          (oldRemaining > 0 && oldNumber === 0) || (newRemaining > 0 && newNumber === 0)) {
        incomplete = true;
        hunk = null;
        continue;
      }
      hunk = { oldRemaining, newRemaining, oldNumber, newNumber };
      continue;
    }
    if (text.startsWith('\\ No newline at end of file')) continue;
    const change = { '+': 'added', '-': 'deleted', ' ': 'context' }[text[0]];
    const usesOld = change === 'deleted' || change === 'context';
    const usesNew = change === 'added' || change === 'context';
    if (hunk && change && (!usesOld || hunk.oldRemaining > 0) && (!usesNew || hunk.newRemaining > 0)) {
      lines.push({ lineNumber: usesNew ? hunk.newNumber++ : hunk.oldNumber, ...(change === 'deleted' ? { lineSide: 'old' } : {}), change, code: text.slice(1) });
      if (usesOld) hunk.oldNumber++;
      if (usesOld) hunk.oldRemaining--;
      if (usesNew) hunk.newRemaining--;
    } else {
      if (hunk || text.startsWith('@@')) incomplete = true;
      hunk = null;
    }
  }
  if (hunk && (hunk.oldRemaining || hunk.newRemaining)) incomplete = true;
  return { lines, incomplete };
}

function prepareAiInput(pullRequest) {
  const changedFiles = Array.isArray(pullRequest?.changedFiles) ? pullRequest.changedFiles : [];
  const files = [];
  const coverage = { scope: 'fetched-files', totalFiles: changedFiles.length, analyzedFiles: 0, skippedFiles: [], truncatedFiles: [], inputCharacters: 2 };

  for (const file of [...changedFiles].sort((a, b) => Number(/test|spec/i.test(a.path)) - Number(/test|spec/i.test(b.path)))) {
    const filePath = typeof file.path === 'string' ? file.path : '';
    const skip = (reason) => coverage.skippedFiles.push({ filePath, reason });
    if (sensitivePath.test(filePath)) { skip('sensitive-file'); continue; }
    if (!codeFile.test(filePath)) { skip('non-code-file'); continue; }
    if (typeof file.patch !== 'string' || !file.patch.trim()) { skip('missing-patch'); continue; }
    if (/^(Binary files .* differ|GIT binary patch)\r?$/m.test(file.patch)) { skip('binary-patch'); continue; }
    // Omit entire files instead of replacing credentials with invented code evidence.
    if (credentialText.test(file.patch) || (/\.sh$/i.test(filePath) && shellCredential.test(file.patch))) { skip('sensitive-content'); continue; }
    if (files.length >= 5) { skip('file-limit'); continue; }

    const parsed = readPatch(file.patch);
    if (!parsed.lines.some(line => line.change === 'added' || line.change === 'deleted')) { skip('no-valid-changed-lines'); continue; }
    let truncated = parsed.incomplete ||
      (Number.isFinite(file.additions) && parsed.lines.filter(line => line.change === 'added').length !== file.additions) ||
      (Number.isFinite(file.deletions) && parsed.lines.filter(line => line.change === 'deleted').length !== file.deletions);
    const selected = { filePath, lines: [] };
    for (const line of parsed.lines) {
      const candidate = { filePath, lines: [...selected.lines, line] };
      if (JSON.stringify(candidate).length > 4000 || JSON.stringify([...files, candidate]).length > 12000) {
        truncated = true;
        break;
      }
      selected.lines.push(line);
    }
    if (!selected.lines.some(line => line.change === 'added' || line.change === 'deleted')) { skip('input-limit'); continue; }
    if (truncated) coverage.truncatedFiles.push(filePath);
    files.push(selected);
  }

  coverage.analyzedFiles = files.length;
  coverage.inputCharacters = JSON.stringify(files).length;
  const intent = {};
  for (const key of ['title', 'description']) {
    const value = pullRequest?.[key];
    if (typeof value === 'string' && !credentialText.test(value) && !shellCredential.test(value)) intent[key] = value.slice(0, key === 'title' ? 200 : 2000);
  }
  const snippets = [];
  const contextOmissions = [...(pullRequest?.reviewContext?.omitted || [])];
  let contextCharacters = 0;
  for (const snippet of pullRequest?.reviewContext?.snippets || []) {
    if (!snippet || typeof snippet.filePath !== 'string' || typeof snippet.code !== 'string'
      || !['old', 'new'].includes(snippet.lineSide) || !Number.isSafeInteger(snippet.startLine) || snippet.startLine < 1) continue;
    if (sensitivePath.test(snippet.filePath) || credentialText.test(snippet.code) || shellCredential.test(snippet.code)) {
      contextOmissions.push({ filePath: snippet.filePath, reason: 'sensitive-content' }); continue;
    }
    // Keep complete source lines and their original coordinates within the input budget.
    const lines = [];
    for (const line of snippet.code.split(/\r?\n/)) {
      if (lines.join('\n').length + line.length + 1 > 2500) break;
      lines.push(line);
    }
    const selected = { filePath: snippet.filePath, lineSide: snippet.lineSide, startLine: snippet.startLine, code: lines.join('\n'), role: snippet.role };
    if (!lines.length || contextCharacters + JSON.stringify(selected).length > 8000) {
      contextOmissions.push({ filePath: snippet.filePath, reason: 'context-input-limit' }); continue;
    }
    if (selected.code !== snippet.code) contextOmissions.push({ filePath: snippet.filePath, reason: 'context-window-limited' });
    snippets.push(selected); contextCharacters += JSON.stringify(selected).length;
  }
  coverage.contextSnippets = snippets.length;
  coverage.retrievalMode = pullRequest?.reviewContext?.scope || 'diff-only';
  coverage.contextSources = snippets.map(snippet => ({ filePath: snippet.filePath, lineSide: snippet.lineSide, startLine: snippet.startLine, endLine: snippet.startLine + snippet.code.split('\n').length - 1, role: snippet.role, revision: snippet.lineSide === 'old' ? pullRequest.baseSha || null : pullRequest.headSha || null }));
  coverage.contextOmissions = contextOmissions;
  const memory = sanitizeReviewMemory(pullRequest.reviewMemory, pullRequest);
  coverage.memorySource = memory ? { analysisId: memory.analysisId, headSha: memory.headSha, acceptedFindings: memory.findings.length } : null;
  coverage.inputCharacters = JSON.stringify({ intent, files, snippets, memory }).length;
  return { files, coverage, intent, snippets, memory };
}

// Keep only human-useful labels on files in this diff; old code/reasons are never copied.
function buildReviewMemory(previous, pullRequest) {
  if (!previous || typeof previous.id !== 'string' || !/^[a-z\d_-]{1,128}$/i.test(previous.id) || !/^[a-f\d]{40}$/i.test(previous.pullRequest?.headSha || '')) return null;
  const useful = new Set(Object.entries(previous.feedback || {}).filter(([, item]) => item?.verdict === 'useful').map(([key]) => Number(key.split('_')[0])));
  const paths = new Set((pullRequest.changedFiles || []).map(file => file.path));
  const findings = [];
  for (const index of useful) {
    const finding = previous.findings?.[index];
    if (!finding || typeof finding.title !== 'string' || !paths.has(finding.filePath) || sensitivePath.test(finding.filePath) || containsSensitiveText(finding.title)) continue;
    findings.push({ title: finding.title.slice(0, 160), filePath: finding.filePath, verdict: 'useful' });
    if (findings.length === 3) break;
  }
  return findings.length ? { analysisId: previous.id, headSha: previous.pullRequest.headSha, findings } : null;
}

function sanitizeReviewMemory(memory, pullRequest) {
  if (!memory || !/^[a-z\d_-]{1,128}$/i.test(memory.analysisId || '') || !/^[a-f\d]{40}$/i.test(memory.headSha || '') || !Array.isArray(memory.findings)) return null;
  const paths = new Set((pullRequest.changedFiles || []).map(file => file.path));
  const findings = memory.findings.slice(0, 3).filter(item => item && typeof item.title === 'string' && item.title.trim() && paths.has(item.filePath)
    && item.filePath.length <= 500 && !sensitivePath.test(item.filePath) && !containsSensitiveText(item.title))
    .map(item => ({ title: item.title.slice(0, 160), filePath: item.filePath, verdict: 'useful' }));
  return findings.length ? { analysisId: memory.analysisId, headSha: memory.headSha, findings } : null;
}

// Rank overlapping paragraphs so long README sections remain searchable with exact lines.
function rankGuidance(code, query) {
  const terms = new Set((query.toLowerCase().match(/[a-z][a-z\d]{2,}/g) || []).slice(0, 80));
  const sections = [];
  const lines = code.split(/\r?\n/);
  let start = 0;
  for (let end = 1; end <= lines.length; end++) {
    if (end < lines.length && !/^#{1,6}\s/.test(lines[end])) continue;
    for (let offset = start; offset < end; offset += 25) {
      const text = lines.slice(offset, Math.min(end, offset + 30)).join('\n');
      const words = new Set(text.toLowerCase().match(/[a-z][a-z\d]{2,}/g) || []);
      const score = [...terms].filter(term => words.has(term)).length;
      if (score) sections.push({ startLine: offset + 1, code: text, score });
      if (offset + 30 >= end) break;
    }
    start = end;
  }
  return sections.sort((a, b) => b.score - a.score || a.startLine - b.startLine).slice(0, 2);
}

const containsSensitiveText = value => credentialText.test(value) || shellCredential.test(value);
export { prepareAiInput, rankGuidance, containsSensitiveText, buildReviewMemory };
