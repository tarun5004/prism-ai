const githubApiBaseUrl = 'https://api.github.com';

// Convert a GitHub Pull Request URL into the repository coordinates used by the API.
function parsePullRequestUrl(pullRequestUrl) {
  const match = pullRequestUrl.match(/^https:\/\/github\.com\/([^/]+)\/([^/]+)\/pull\/(\d+)\/?$/);

  if (!match) {
    throw new Error('Enter a valid GitHub Pull Request URL.');
  }

  return { owner: match[1], repository: match[2], number: match[3] };
}

// Retrieve only the Pull Request metadata and changed files needed by the beta report.
async function fetchPullRequest(pullRequestUrl) {
  const coordinates = parsePullRequestUrl(pullRequestUrl);
  const headers = {
    Accept: 'application/vnd.github+json',
    'User-Agent': 'prism-ai-beta'
  };

  if (process.env.GITHUB_TOKEN) {
    headers.Authorization = `Bearer ${process.env.GITHUB_TOKEN}`;
  }

  const pullRequestResponse = await fetch(
    `${githubApiBaseUrl}/repos/${coordinates.owner}/${coordinates.repository}/pulls/${coordinates.number}`,
    { headers }
  );

  if (!pullRequestResponse.ok) {
    throw new Error(`GitHub Pull Request request failed with status ${pullRequestResponse.status}.`);
  }

  const pullRequest = await pullRequestResponse.json();
  const filesResponse = await fetch(
    `${githubApiBaseUrl}/repos/${coordinates.owner}/${coordinates.repository}/pulls/${coordinates.number}/files?per_page=100`,
    { headers }
  );

  if (!filesResponse.ok) {
    throw new Error(`GitHub changed-files request failed with status ${filesResponse.status}.`);
  }

  const files = await filesResponse.json();

  return {
    key: `${coordinates.owner}/${coordinates.repository}#${coordinates.number}`,
    title: pullRequest.title,
    repository: `${coordinates.owner}/${coordinates.repository}`,
    author: pullRequest.user?.login || 'unknown',
    state: pullRequest.state,
    url: pullRequest.html_url,
    baseBranch: pullRequest.base?.ref || 'unknown',
    headBranch: pullRequest.head?.ref || 'unknown',
    changedFiles: files.map((file) => ({
      path: file.filename,
      status: file.status,
      additions: file.additions,
      deletions: file.deletions,
      changes: file.changes,
      patch: file.patch || ''
    }))
  };
}

export { fetchPullRequest };