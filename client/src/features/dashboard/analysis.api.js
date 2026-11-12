const apiBaseUrl = (import.meta.env?.VITE_API_BASE_URL || '/api').replace(/\/$/, '');

function isReport(value) {
  return value && typeof value.id === 'string' && ['completed', 'failed'].includes(value.status)
    && value.pullRequest && typeof value.pullRequest === 'object' && Array.isArray(value.findings);
}

async function readProgress(response, onProgress) {
  if (!response.body) throw new Error('The progress connection is unavailable.');
  const reader = response.body.getReader();
  const decoder = new TextDecoder('utf-8', { fatal: true });
  const stages = ['fetching', 'context', 'reviewing', 'saving'];
  let buffer = '';
  let report;
  let lastStage = -1;
  const readFrame = line => {
    if (!line.trim()) return;
    let frame;
    try { frame = JSON.parse(line); } catch { throw new Error('The server sent invalid progress data.'); }
    if (report || !frame || typeof frame !== 'object') throw new Error('The server sent invalid progress data.');
    if (frame.type === 'progress') {
      const index = stages.indexOf(frame.stage);
      if (index < 0 || index < lastStage) throw new Error('The server sent invalid progress data.');
      if (index !== lastStage) onProgress(frame.stage);
      lastStage = index;
    } else if (frame.type === 'result' && isReport(frame.report)) {
      report = frame.report;
    } else if (frame.type === 'error') {
      throw new Error(typeof frame.message === 'string' && frame.message.length <= 1000 ? frame.message : 'Analysis could not be completed.');
    } else throw new Error('The server sent an invalid progress report.');
  };
  try {
    while (true) {
      const { done, value } = await reader.read();
      buffer += done ? decoder.decode() : decoder.decode(value, { stream: true });
      if (buffer.length > 8 * 1024 * 1024) throw new Error('The progress report exceeded the supported size.');
      let end;
      while ((end = buffer.indexOf('\n')) >= 0) {
        readFrame(buffer.slice(0, end));
        buffer = buffer.slice(end + 1);
      }
      if (done) break;
    }
    if (buffer.trim()) readFrame(buffer);
    if (!report) throw new Error('The connection ended before the report arrived. Check history before starting another review.');
    return report;
  } catch (error) {
    if (error instanceof TypeError) throw new Error('The progress connection was interrupted. Check history before starting another review.');
    throw error;
  } finally {
    await reader.cancel().catch(() => {});
    reader.releaseLock();
  }
}

async function request(path, options, failureMessage, onProgress) {
  let response;
  try {
    response = await fetch(`${apiBaseUrl}/analyses${path}`, { ...options, credentials: 'include' });
  } catch {
    if (options?.signal?.aborted) throw new Error('The review request was cancelled.');
    throw new Error('Could not reach PRism. Check that the backend is running.');
  }
  if (response.ok && onProgress && response.headers.get('content-type')?.startsWith('application/x-ndjson')) {
    return readProgress(response, onProgress);
  }
  let result;
  try { result = await response.json(); } catch { throw new Error(failureMessage); }
  if (!response.ok) throw new Error(result.message || result.error || failureMessage);
  return result;
}

async function loadRecentAnalyses({ signal } = {}) {
  const result = await request('', signal ? { signal } : undefined, 'Recent analyses could not be loaded.');
  if (!Array.isArray(result) || !result.every(isReport)) throw new Error('The server returned an invalid response for history.');
  return result;
}

async function loadSampleAnalysis(options) {
  const reports = (await loadRecentAnalyses(options)).filter(report => report.status === 'completed' && /^[a-z\d_-]{1,128}$/i.test(report.id));
  return reports.find(report => ['completed', 'partial'].includes(report.aiStatus) && report.aiReview?.summary)
    || reports[0] || null;
}

async function loadAnalysis(id) {
  const result = await request(`/${encodeURIComponent(id)}`, undefined, 'This report could not be loaded.');
  if (!isReport(result)) throw new Error('The server returned an invalid response for this report.');
  return result;
}

async function createAnalysis(pullRequestUrl, { onProgress, signal } = {}) {
  const result = await request('', {
    method: 'POST', headers: { 'Content-Type': 'application/json', ...(onProgress ? { Accept: 'application/x-ndjson' } : {}) },
    body: JSON.stringify({ pullRequestUrl }), signal
  }, 'Analysis could not be created.', onProgress);
  if (!isReport(result)) throw new Error('The server returned an invalid response for this analysis.');
  return result;
}

async function saveFindingFeedback(id, findingIndex, verdict, reason = '') {
  const result = await request(`/${encodeURIComponent(id)}/findings/${findingIndex}/feedback`, {
    method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ verdict, reason })
  }, 'Feedback could not be saved.');
  if (!isReport(result)) throw new Error('The server returned invalid feedback data.');
  return result;
}

async function loadGitHubSession() {
  const response = await fetch(`${apiBaseUrl}/github/session`, { credentials: 'include' });
  if (!response.ok) throw new Error('GitHub connection status is unavailable.');
  const result = await response.json();
  if (typeof result.enabled !== 'boolean' || typeof result.authenticated !== 'boolean') throw new Error('Invalid connection status.');
  return result;
}

async function logoutGitHub() {
  const response = await fetch(`${apiBaseUrl}/github/logout`, { method: 'POST', credentials: 'include' });
  if (!response.ok) throw new Error('Sign out failed. Please try again.');
}

const githubLoginUrl = `${apiBaseUrl}/github/login`;
async function loadDemoAnalysis({ signal } = {}) {
  let response;
  try { response = await fetch(`${apiBaseUrl}/demo/report`, { signal }); }
  catch { throw new Error('The recorded sample could not be reached. Please try again.'); }
  if (!response.ok) throw new Error('The recorded sample is temporarily unavailable.');
  const report = await response.json();
  if (!isReport(report) || report.sample?.readOnly !== true) throw new Error('The server returned an invalid sample.');
  return report;
}

export { createAnalysis, loadAnalysis, loadRecentAnalyses, loadSampleAnalysis, saveFindingFeedback, loadGitHubSession, logoutGitHub, githubLoginUrl, loadDemoAnalysis };
