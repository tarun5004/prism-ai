function getAiStatusDetails(analysis) {
  if (analysis.status === 'failed') {
    return {
      tone: 'warning',
      label: 'AI review not completed',
      message: 'The PR analysis failed. No successful AI review is confirmed.',
    };
  }
  if (analysis.aiStatus === 'completed') {
    return {
      tone: 'success',
      label: 'AI analysis completed',
      message: 'The model returned a validated response. Findings remain advisory.',
    };
  }
  if (analysis.aiStatus === 'partial') {
    return {
      tone: 'warning',
      label: 'AI analysis partial',
      message:
        analysis.aiError === 'INVALID_FINDINGS'
          ? 'Some AI findings were rejected. Available validated findings and completed rule-based results are shown.'
          : 'AI reviewed limited diff context. Available validated findings and completed rule-based results are shown.',
    };
  }

  const rulesMessage =
    analysis.status === 'completed'
      ? 'Rule-based analysis completed; its results remain available.'
      : 'Rule-based completion is not confirmed for this report.';
  if (analysis.aiStatus === 'unavailable' || analysis.aiStatus === 'failed') {
    const errors = {
      TIMEOUT: 'The AI request timed out.',
      API_ERROR: 'The AI provider could not complete the request.',
      PROVIDER_ACCESS_DENIED:
        'The AI provider denied access from this deployment. Check provider permissions and supported deployment regions.',
      PROVIDER_REGION_UNAVAILABLE:
        'The AI provider does not support this deployment region. Move the worker to a supported region.',
      INVALID_RESPONSE: 'The AI response could not be validated.',
      INVALID_RETRY_LIMIT: 'AI retry configuration must be 0 or 1.',
      INVALID_FINDINGS: 'The AI findings could not be validated.',
      INVALID_REVIEW:
        'The AI review explanation could not be validated. Any valid findings are shown separately.',
      INVALID_TIMEOUT: 'AI request configuration needs attention.',
      INVALID_PROVIDER: 'Select a supported AI provider on the server.',
      MISSING_MODEL: 'The selected provider needs a model name.',
      UNSAFE_LOGGING: 'Disable verbose model logging on the server.',
    };
    const reason =
      analysis.aiError === 'API_ERROR' && analysis.aiDiagnostics?.httpStatus === 403
        ? errors.PROVIDER_ACCESS_DENIED
        : analysis.aiError === 'API_ERROR' && analysis.aiDiagnostics?.httpStatus === 504
          ? 'The AI request exceeded its processing deadline.'
          : typeof analysis.aiError === 'string' && Object.hasOwn(errors, analysis.aiError)
            ? errors[analysis.aiError]
            : 'AI analysis could not be completed.';
    return { tone: 'warning', label: 'AI analysis unavailable', message: `${reason} ${rulesMessage}` };
  }
  if (analysis.aiStatus === 'skipped') {
    const reason =
      analysis.aiError === 'MISSING_API_KEY'
        ? 'AI is not configured.'
        : analysis.aiError === 'NO_REVIEWABLE_DIFF'
          ? 'No reviewable diff was available for AI.'
          : 'AI analysis was skipped.';
    return { tone: 'neutral', label: 'AI analysis skipped', message: `${reason} ${rulesMessage}` };
  }
  return {
    tone: 'neutral',
    label: 'AI status not recorded',
    message: `This saved report does not confirm a successful AI review. ${rulesMessage}`,
  };
}

function formatDate(value) {
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? 'Date unavailable' : date.toLocaleString();
}

function getFailureMessage(analysis) {
  const messages = {
    GITHUB_RATE_LIMIT: 'GitHub rate limit reached. Wait before analyzing again or check the server token.',
    GITHUB_AUTH: 'GitHub authentication failed. Check the server token.',
    GITHUB_ACCESS: 'GitHub denied access. Check repository permissions and try again later.',
    GITHUB_NOT_FOUND: 'This PR was not found or is not accessible with the server token.',
    GITHUB_TIMEOUT: 'GitHub retrieval timed out. Try again later.',
    REVISION_CHANGED: 'The PR revision changed during retrieval. Analyze the latest revision again.',
    REPORT_TOO_LARGE: 'This PR exceeds the demo’s 4 MiB report limit. Choose a smaller PR.',
    GITHUB_UNAVAILABLE: 'GitHub could not be reached or returned an unusable response. Try again later.',
  };
  return Object.hasOwn(messages, analysis.errorCode)
    ? messages[analysis.errorCode]
    : 'This analysis did not complete. Check backend connectivity and GitHub access before trying again.';
}

export { getAiStatusDetails, formatDate, getFailureMessage };
