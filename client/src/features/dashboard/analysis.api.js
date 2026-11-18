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
  if (options?.signal?.aborted) throw new Error('The review request was cancelled. Accepted work continues on the server.');
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
  if (!response.ok) throw Object.assign(new Error(result.message || result.error || failureMessage), { status: response.status });
  if (response.status === 202) return { acceptedJob: result };
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

async function readReport(id, signal) {
  const result = await request(`/${encodeURIComponent(id)}`, { signal }, 'This report could not be loaded.');
  if (!isReport(result)) throw new Error('The server returned an invalid response for this report.');
  return result;
}

function waitForPoll(signal) {
  return new Promise((resolve, reject) => {
    const cancel = () => { clearTimeout(timer); signal?.removeEventListener('abort', cancel); reject(new Error('The review request was cancelled. Accepted work continues on the server.')); };
    const timer = setTimeout(() => { signal?.removeEventListener('abort', cancel); resolve(); }, 5000);
    signal?.addEventListener('abort', cancel, { once: true });
    if (signal?.aborted) cancel();
  });
}

async function waitForAnalysis(id, { signal, onProgress = () => {}, wait = waitForPoll, maxPolls = 120 } = {}) {
  let previous;
  for (let attempt = 0; attempt < maxPolls; attempt++) {
    const job = await request(`/${encodeURIComponent(id)}/job`, { signal }, 'Review job could not be loaded.');
    if (!job || job.id !== id || !['queued', 'running', 'completed', 'failed', 'unknown', 'skipped'].includes(job.status)) throw new Error('The server returned an invalid review job.');
    if (job.status === 'completed') return readReport(id, signal);
    if (job.status === 'failed') {
      try { return await readReport(id, signal); }
      catch (error) { if (error.status !== 404) throw error; }
      throw new Error('Review failed. Check the saved job before starting another review.');
    }
    if (job.status === 'unknown') throw new Error('Review was interrupted. Operator recovery is required; it will not retry AI automatically.');
    if (job.status === 'skipped') throw new Error('Review was skipped by repository controls or the review policy.');
    if (previous !== job.status) onProgress(job.status);
    previous = job.status;
    if (attempt + 1 < maxPolls) await wait(signal);
  }
  throw new Error('Review is still queued or in progress. Reopen this report URL later; do not submit it again.');
}

async function loadAnalysis(id, options = {}) {
  try { return await readReport(id, options.signal); }
  catch (error) { if (error.status !== 404 || !/^webhook-[a-f\d]{64}$/.test(id)) throw error; }
  return waitForAnalysis(id, options);
}

async function createAnalysis(pullRequestUrl, { onProgress, signal, onAccepted = () => {}, ...pollOptions } = {}) {
  const result = await request('', {
    method: 'POST', headers: { 'Content-Type': 'application/json', ...(onProgress ? { Accept: 'application/x-ndjson' } : {}) },
    body: JSON.stringify({ pullRequestUrl }), signal
  }, 'Analysis could not be created.', onProgress);
  if (result?.acceptedJob) {
    const job = result.acceptedJob;
    if (typeof job.id !== 'string' || !/^webhook-[a-f\d]{64}$/.test(job.id) || !['queued', 'running', 'completed', 'failed', 'unknown', 'skipped'].includes(job.status)) throw new Error('The server returned an invalid accepted review.');
    onAccepted(job.id);
    onProgress?.('queued');
    return waitForAnalysis(job.id, { ...pollOptions, onProgress, signal });
  }
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

async function setEmailNotifications(enabled) {
  try {
    if (typeof enabled !== 'boolean') throw new Error();
    const response = await fetch(`${apiBaseUrl}/github/notifications/email`, { method: 'PUT', credentials: 'include', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ enabled }) });
    if (!response.ok) {
      const data = await response.json().catch(() => null);
      if (response.status === 400) throw new Error(data?.message || 'Verify your GitHub email first.');
      throw new Error();
    }
    const result = await response.json();
    if (typeof result.enabled !== 'boolean') throw new Error();
    return result;
  } catch (error) { throw new Error(error?.message || 'Email notification preference could not be saved.'); }
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
export { setEmailNotifications };

async function decidePublication(id, decision) {
  if (!/^[a-z\d_-]{1,128}$/i.test(id || '') || !['approve', 'reject'].includes(decision)) throw Error('Invalid publication decision.');
  const result = await request(`/${id}/publication`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ decision }) }, 'Summary status could not be confirmed. Reload the report before retrying.');
  if (!isReport(result) || !['pending', 'publishing', 'published', 'rejected', 'unknown'].includes(result.publication?.status)) throw Error('The server returned an invalid publication status. Reload the report.');
  return result;
}
export { decidePublication };
