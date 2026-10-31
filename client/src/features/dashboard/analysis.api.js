const apiBaseUrl = 'http://localhost:5000/api';

function isReport(value) {
  return value && typeof value.id === 'string' && ['completed', 'failed'].includes(value.status)
    && value.pullRequest && typeof value.pullRequest === 'object' && Array.isArray(value.findings);
}

async function request(path, options, failureMessage) {
  let response;
  try {
    response = await fetch(`${apiBaseUrl}/analyses${path}`, options);
  } catch {
    throw new Error('Could not reach PRism. Check that the backend is running.');
  }
  let result;
  try { result = await response.json(); } catch { throw new Error(failureMessage); }
  if (!response.ok) throw new Error(result.message || result.error || failureMessage);
  return result;
}

async function loadRecentAnalyses() {
  const result = await request('', undefined, 'Recent analyses could not be loaded.');
  if (!Array.isArray(result) || !result.every(isReport)) throw new Error('The server returned an invalid response for history.');
  return result;
}

async function loadAnalysis(id) {
  const result = await request(`/${encodeURIComponent(id)}`, undefined, 'This report could not be loaded.');
  if (!isReport(result)) throw new Error('The server returned an invalid response for this report.');
  return result;
}

async function createAnalysis(pullRequestUrl) {
  const result = await request('', {
    method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ pullRequestUrl })
  }, 'Analysis could not be created.');
  if (!isReport(result)) throw new Error('The server returned an invalid response for this analysis.');
  return result;
}

export { createAnalysis, loadAnalysis, loadRecentAnalyses };
