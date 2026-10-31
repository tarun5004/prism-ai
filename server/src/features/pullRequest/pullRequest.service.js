const githubApiBaseUrl = 'https://api.github.com';

class PullRequestError extends Error {
  constructor(message, statusCode = 502) {
    super(message);
    this.statusCode = statusCode;
  }
}

function parsePullRequestUrl(value) {
  const match = typeof value === 'string' && value.match(/^https:\/\/github\.com\/([a-z\d-]+)\/([\w.-]+)\/pull\/([1-9]\d*)\/?$/i);
  if (!match || match[2] === '.' || match[2] === '..') {
    throw new PullRequestError('Enter a valid GitHub Pull Request URL.', 400);
  }
  return { owner: match[1], repository: match[2], number: match[3] };
}

async function requestGitHub(address, options) {
  try {
    const response = await fetch(address, options);
    if (!response.ok) {
      let message = `GitHub request failed (HTTP ${response.status}).`;
      if (response.status === 401) message = 'GitHub authentication failed. Check the server GitHub token.';
      if (response.status === 403) message = response.headers.get('x-ratelimit-remaining') === '0'
        ? 'GitHub rate limit reached. Wait before trying again or check the server GitHub token.'
        : 'GitHub denied access. Check repository permissions or try again later.';
      if (response.status === 404) message = 'Pull Request not found or not accessible with the server GitHub token.';
      if (response.status === 429) message = 'GitHub rate limit reached. Wait before trying again.';
      throw new PullRequestError(message);
    }
    return await response.json();
  } catch (error) {
    if (error instanceof PullRequestError) throw error;
    if (error.name === 'TimeoutError' || options.signal.aborted) {
      throw new PullRequestError('GitHub request timed out. Try again later.');
    }
    throw new PullRequestError('Could not connect to GitHub or read its response. Try again later.');
  }
}

async function fetchPullRequest(pullRequestUrl) {
  const { owner, repository, number } = parsePullRequestUrl(pullRequestUrl);
  const headers = { Accept: 'application/vnd.github+json', 'User-Agent': 'prism-ai-beta' };
  if (process.env.GITHUB_TOKEN) headers.Authorization = `Bearer ${process.env.GITHUB_TOKEN}`;
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

export { fetchPullRequest, PullRequestError };
