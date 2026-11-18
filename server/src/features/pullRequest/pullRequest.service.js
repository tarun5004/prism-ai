import { posix } from 'node:path';
import { rankGuidance } from '../ai/ai.context.js';
import { parseReviewPolicy } from './review.policy.js';

const githubApiBaseUrl = 'https://api.github.com';

class PullRequestError extends Error {
  constructor(message, statusCode = 502, code = 'GITHUB_UNAVAILABLE') {
    super(message);
    this.statusCode = statusCode;
    this.code = { 400: 'INVALID_PR_URL', 409: 'REVISION_CHANGED', 413: 'REPORT_TOO_LARGE' }[statusCode] || code;
  }
}

function parsePullRequestUrl(value) {
  const match = typeof value === 'string' && value.match(/^https:\/\/github\.com\/([a-z\d-]+)\/([\w.-]+)\/pull\/([1-9]\d*)\/?$/i);
  if (!match || match[2] === '.' || match[2] === '..') {
    throw new PullRequestError('Enter a valid GitHub Pull Request URL.', 400);
  }
  return { owner: match[1], repository: match[2], number: match[3] };
}

async function requestGitHub(address, options, maxBytes, allowMissing = false) {
  try {
    const response = await fetch(address, options);
    if (allowMissing && response.status === 404) return null;
    if (!response.ok) {
      let message = `GitHub request failed (HTTP ${response.status}).`;
      if (response.status === 401) message = 'GitHub authentication failed. Check the server GitHub token.';
      if (response.status === 403) message = response.headers.get('x-ratelimit-remaining') === '0'
        ? 'GitHub rate limit reached. Wait before trying again or check the server GitHub token.'
        : 'GitHub denied access. Check repository permissions or try again later.';
      if (response.status === 404) message = 'Pull Request not found or not accessible with the server GitHub token.';
      if (response.status === 429) message = 'GitHub rate limit reached. Wait before trying again.';
      const code = response.status === 429 || response.headers.get('x-ratelimit-remaining') === '0' ? 'GITHUB_RATE_LIMIT'
        : response.status === 401 ? 'GITHUB_AUTH' : response.status === 403 ? 'GITHUB_ACCESS' : response.status === 404 ? 'GITHUB_NOT_FOUND' : 'GITHUB_UNAVAILABLE';
      throw new PullRequestError(message, 502, code);
    }
    if (!maxBytes) return await response.json();
    const reader = response.body.getReader();
    const chunks = [];
    let bytes = 0;
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      bytes += value.length;
      if (bytes > maxBytes) {
        await reader.cancel();
        throw new PullRequestError('GitHub source content is too large for this review.');
      }
      chunks.push(value);
    }
    return JSON.parse(Buffer.concat(chunks).toString('utf8'));
  } catch (error) {
    if (error instanceof PullRequestError) throw error;
    if (error.name === 'TimeoutError' || options.signal.aborted) {
      throw new PullRequestError('GitHub request timed out. Try again later.', 502, 'GITHUB_TIMEOUT');
    }
    throw new PullRequestError('Could not connect to GitHub or read its response. Try again later.');
  }
}

async function fetchRepositoryPolicy(pullRequest, { token = process.env.GITHUB_TOKEN } = {}) {
  try {
    if (!pullRequest.baseSha) throw Error('Missing trusted revision');
    const { owner, repository } = parsePullRequestUrl(pullRequest.url);
    const headers = { Accept: 'application/vnd.github+json', 'User-Agent': 'prism-ai', ...(token ? { Authorization: `Bearer ${token}` } : {}) };
    const data = await requestGitHub(`${githubApiBaseUrl}/repos/${owner}/${repository}/contents/.prism.json?ref=${encodeURIComponent(pullRequest.baseSha)}`,
      { headers, signal: AbortSignal.timeout(10000) }, 16000, true);
    if (!data) return parseReviewPolicy();
    if (data.encoding !== 'base64' || typeof data.content !== 'string' || data.size > 8000) throw Error('Policy size');
    const text = Buffer.from(data.content, 'base64').toString('utf8');
    if (Buffer.byteLength(text) > 8000) throw Error('Policy size');
    return parseReviewPolicy(JSON.parse(text));
  } catch { throw new PullRequestError('Repository policy could not be read or is invalid. Check .prism.json on the base revision.', 502, 'REVIEW_POLICY_INVALID'); }
}

async function fetchIncrementalReview(current, previous, { installationId, token = process.env.GITHUB_TOKEN } = {}) {
  const full = reason => ({ ...current, reviewScope: { mode: 'full', fallbackReason: reason } });
  const old = previous?.pullRequest;
  if (previous?.aiStatus !== 'completed' || (previous.installationId || undefined) !== installationId
    || old?.key?.toLowerCase() !== current.key?.toLowerCase() || old?.baseSha !== current.baseSha
    || !/^[a-f\d]{40}$/i.test(old?.headSha || '') || old.headSha === current.headSha) return full('no-compatible-baseline');
  try {
    const { owner, repository } = parsePullRequestUrl(current.url);
    const headers = { Accept: 'application/vnd.github+json', 'User-Agent': 'prism-ai', ...(token ? { Authorization: `Bearer ${token}` } : {}) };
    const data = await requestGitHub(`${githubApiBaseUrl}/repos/${owner}/${repository}/compare/${old.headSha}...${current.headSha}`,
      { headers, signal: AbortSignal.timeout(15000) }, 4 * 1024 * 1024);
    // GitHub comparison files cap at 300. At the boundary, prefer a full review.
    if (data.status !== 'ahead' || data.base_commit?.sha !== old.headSha || data.merge_base_commit?.sha !== old.headSha
      || !Array.isArray(data.files) || data.files.length >= 300 || data.files.some(file => typeof file?.filename !== 'string')) throw Error('Incomplete compare');
    return { ...current, diffBaseSha: old.headSha, totalChangedFiles: data.files.length, filesComplete: true,
      changedFiles: data.files.map(file => ({ path: file.filename, ...(file.previous_filename ? { previousPath: file.previous_filename } : {}),
        status: file.status, additions: file.additions, deletions: file.deletions, changes: file.changes,
        patchAvailable: Boolean(file.patch), patch: typeof file.patch === 'string' ? file.patch : '' })),
      reviewScope: { mode: 'incremental', previousAnalysisId: previous.id, fromSha: old.headSha, toSha: current.headSha } };
  } catch { return full('compare-unavailable-or-incomplete'); }
}

async function fetchPullRequest(pullRequestUrl, { token = process.env.GITHUB_TOKEN } = {}) {
  const { owner, repository, number } = parsePullRequestUrl(pullRequestUrl);
  const headers = { Accept: 'application/vnd.github+json', 'User-Agent': 'prism-ai-beta' };
  if (token) headers.Authorization = `Bearer ${token}`;
  // One deadline bounds the entire retrieval, including pagination. No retries.
  const options = { headers, signal: AbortSignal.timeout(30000) };
  const address = `${githubApiBaseUrl}/repos/${owner}/${repository}/pulls/${number}`;
  const pullRequest = await requestGitHub(address, options);
  if (!pullRequest || typeof pullRequest !== 'object' || Array.isArray(pullRequest)) {
    throw new PullRequestError('GitHub returned invalid Pull Request metadata.');
  }
  const totalChangedFiles = Number.isSafeInteger(pullRequest.changed_files) && pullRequest.changed_files >= 0
    ? pullRequest.changed_files : null;
  const files = [];
  let snapshotBytes = Buffer.byteLength(JSON.stringify(pullRequest), 'utf8');
  let reachedEnd = false;

  // GitHub exposes at most 3000 PR files, with at most 100 files per page.
  for (let page = 1; page <= 30; page++) {
    const batch = await requestGitHub(`${address}/files?per_page=100&page=${page}`, options);
    if (!Array.isArray(batch) || batch.length > 100 || batch.some(file => !file || typeof file.filename !== 'string')) {
      throw new PullRequestError('GitHub returned an invalid changed-file list.');
    }
    snapshotBytes += Buffer.byteLength(JSON.stringify(batch), 'utf8');
    // Leave room for findings and BSON overhead within MongoDB's document limit.
    if (snapshotBytes > 4 * 1024 * 1024) {
      throw new PullRequestError('This Pull Request exceeds the demo\'s 4 MiB report limit. Analyze a smaller PR.', 413);
    }
    files.push(...batch);
    if (batch.length < 100 || (totalChangedFiles !== null && files.length >= totalChangedFiles)) {
      reachedEnd = true;
      break;
    }
  }

  // The files endpoint is not pinned to a SHA; refuse a mixed-revision snapshot.
  if (pullRequest.base?.sha && pullRequest.head?.sha) {
    const latest = await requestGitHub(address, options);
    if (latest?.base?.sha !== pullRequest.base.sha || latest?.head?.sha !== pullRequest.head.sha) {
      throw new PullRequestError('The Pull Request changed while files were loading. Analyze the latest revision again.', 409);
    }
  }

  return {
    key: `${owner}/${repository}#${number}`,
    title: pullRequest.title,
    description: typeof pullRequest.body === 'string' ? pullRequest.body : '',
    repository: `${owner}/${repository}`,
    author: pullRequest.user?.login || 'unknown',
    state: pullRequest.state,
    url: pullRequest.html_url,
    baseBranch: pullRequest.base?.ref || 'unknown',
    headBranch: pullRequest.head?.ref || 'unknown',
    baseSha: pullRequest.base?.sha || null,
    headSha: pullRequest.head?.sha || null,
    fetchedAt: new Date().toISOString(),
    totalChangedFiles,
    filesComplete: totalChangedFiles === null ? reachedEnd && files.length < 3000 : files.length === totalChangedFiles,
    changedFiles: files.map(file => ({
      path: file.filename,
      ...(file.previous_filename ? { previousPath: file.previous_filename } : {}),
      status: file.status,
      additions: file.additions,
      deletions: file.deletions,
      changes: file.changes,
      patchAvailable: typeof file.patch === 'string' && file.patch.length > 0,
      patch: typeof file.patch === 'string' ? file.patch : ''
    }))
  };
}

// Best-effort context enrichment. A missing source must not discard the saved diff.
async function fetchReviewContext(pullRequest, { guidance = process.env.REVIEW_GUIDANCE === 'lexical', token = process.env.GITHUB_TOKEN, relatedTests = false } = {}) {
  const result = { scope: 'bounded-js-ts-imports', snippets: [], omitted: [], requests: 0 };
  if (!pullRequest.headSha || !pullRequest.baseSha) {
    result.omitted.push({ reason: 'revision-unavailable' });
    return result;
  }
  const { owner, repository } = parsePullRequestUrl(pullRequest.url);
  const headers = { Accept: 'application/vnd.github+json', 'User-Agent': 'prism-ai-beta' };
  if (token) headers.Authorization = `Bearer ${token}`;
  const options = { headers, signal: AbortSignal.timeout(20000) };
  const seen = new Set();
  const imports = [];
  const candidates = pullRequest.changedFiles.filter(file => /\.[cm]?[jt]sx?$/i.test(file.path) && file.patch)
    .sort((a, b) => Number(/test|spec/i.test(a.path)) - Number(/test|spec/i.test(b.path)));
  const readSource = async (path, sha) => {
    if (result.requests >= 8 || options.signal.aborted) throw new Error('Context budget reached');
    result.requests++;
    const address = `${githubApiBaseUrl}/repos/${owner}/${repository}/contents/${path.split('/').map(encodeURIComponent).join('/')}?ref=${encodeURIComponent(sha)}`;
    const data = await requestGitHub(address, options, 100000);
    if (data.encoding !== 'base64' || typeof data.content !== 'string' || data.size > 64000) throw new Error('Source unavailable');
    const code = Buffer.from(data.content, 'base64');
    if (code.length > 64000 || code.includes(0)) throw new Error('Non-text or oversized source');
    return code.toString('utf8');
  };

  for (const file of candidates.slice(0, 5)) {
    const oldSide = file.status === 'removed' || (file.additions === 0 && file.deletions > 0);
    const sha = oldSide ? pullRequest.diffBaseSha || pullRequest.baseSha : pullRequest.headSha;
    const path = oldSide ? file.previousPath || file.path : file.path;
    seen.add(`${sha}:${path}`);
    try {
      const code = await readSource(path, sha);
      const lines = code.split(/\r?\n/);
      const windows = [];
      for (const header of file.patch.matchAll(/^@@ -(\d+)(?:,\d+)? \+(\d+)(?:,\d+)? @@/gm)) {
        const anchor = Number(header[oldSide ? 1 : 2]);
        if (!Number.isSafeInteger(anchor)) continue;
        const start = Math.max(0, anchor - 13);
        const end = Math.min(lines.length, anchor + 18);
        if (windows.some(window => start <= window.end && end >= window.start)) {
          const window = windows.find(window => start <= window.end && end >= window.start);
          window.start = Math.min(window.start, start); window.end = Math.max(window.end, end);
        } else if (windows.length < 3) windows.push({ start, end });
      }
      for (const window of windows) result.snippets.push({ filePath: file.path, sourcePath: path, lineSide: oldSide ? 'old' : 'new', startLine: window.start + 1, code: lines.slice(window.start, Math.min(window.end, window.start + 80)).join('\n'), role: 'surrounding-code' });
      for (const match of code.matchAll(/\b(?:from\s*|import\s*(?:\(\s*)?|require\s*\(\s*)['"](\.[^'"]+)['"]/g)) {
        const target = posix.normalize(posix.join(posix.dirname(path), match[1]));
        if (!target.startsWith('../') && !posix.isAbsolute(target) && !/[?#%\x00]/.test(target)) imports.push({ path: target, sha, lineSide: oldSide ? 'old' : 'new', extension: posix.extname(path) });
      }
    } catch { result.omitted.push({ filePath: file.path, reason: 'source-unavailable-or-limited' }); }
  }
  for (const file of candidates.slice(5)) result.omitted.push({ filePath: file.path, reason: 'source-file-limit' });
  // Two deterministic candidates total, sharing the existing eight-read budget.
  // This finds nearby tests; it neither clones the repository nor executes tests.
  if (relatedTests) {
    let attempts = 0;
    for (const file of candidates.slice(0, 5).filter(file => !/\.(test|spec)\.[^.]+$/.test(file.path))) {
      const extension = posix.extname(file.path);
      const stem = posix.basename(file.path, extension);
      const oldSide = file.status === 'removed' || (file.additions === 0 && file.deletions > 0);
      const sha = oldSide ? pullRequest.diffBaseSha || pullRequest.baseSha : pullRequest.headSha;
      for (const path of [posix.join(posix.dirname(file.path), `${stem}.test${extension}`), `test/${stem}.test${extension}`]) {
        if (attempts >= 2 || result.requests >= 8 || options.signal.aborted) break;
        if (seen.has(`${sha}:${path}`)) continue;
        seen.add(`${sha}:${path}`); attempts++;
        try {
          const code = await readSource(path, sha);
          result.snippets.push({ filePath: path, lineSide: oldSide ? 'old' : 'new', startLine: 1,
            code: code.split(/\r?\n/).slice(0, 60).join('\n'), role: 'related-test', relatedTo: [file.path] });
        } catch { result.omitted.push({ filePath: path, reason: 'related-test-unavailable' }); }
      }
    }
  }
  // Try at most three import paths. This is a heuristic, not a complete dependency graph.
  let importAttempts = 0;
  for (const item of imports) {
    const paths = posix.extname(item.path) ? [item.path] : [`${item.path}${item.extension}`, `${item.path}/index${item.extension}`];
    for (const path of paths) {
      if (seen.has(`${item.sha}:${path}`)) continue;
      // In guidance mode, leave two of the shared eight reads for repository rules.
      if (importAttempts >= 3 || result.requests >= (guidance ? 6 : 8) || options.signal.aborted) {
        result.omitted.push({ filePath: item.path, reason: 'import-budget' }); break;
      }
      seen.add(`${item.sha}:${path}`); importAttempts++;
      try {
        const code = await readSource(path, item.sha);
        result.snippets.push({ filePath: path, lineSide: item.lineSide, startLine: 1, code: code.split(/\r?\n/).slice(0, 60).join('\n'), role: 'direct-import' });
        break;
      } catch { result.omitted.push({ filePath: path, reason: 'import-unavailable' }); }
    }
  }
  if (guidance) {
    result.scope = 'bounded-js-ts-imports+lexical-guidance-v1';
    for (const path of ['README.md', 'CONTRIBUTING.md']) {
      try {
        const code = await readSource(path, pullRequest.headSha);
        const sections = rankGuidance(code, [pullRequest.title, pullRequest.description, ...candidates.map(file => file.path)].join(' '));
        for (const section of sections) result.snippets.push({ filePath: path, lineSide: 'new', startLine: section.startLine, code: section.code, role: 'repository-guidance', revision: pullRequest.headSha });
        if (!sections.length) result.omitted.push({ filePath: path, reason: 'no-lexical-match' });
      } catch { result.omitted.push({ filePath: path, reason: 'guidance-unavailable-or-limited' }); }
    }
  }
  return result;
}

export { fetchPullRequest, fetchReviewContext, fetchRepositoryPolicy, fetchIncrementalReview, PullRequestError };
