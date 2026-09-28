// Build a normalized finding so rule output stays predictable for the dashboard.
function createFinding(category, severity, explanation, evidence, affectedFiles, recommendedAction) {
  return {
    category,
    severity,
    confidence: 'medium',
    explanation,
    evidence,
    affectedFiles,
    recommendedAction,
    source: 'rule'
  };
}

// Run a small set of transparent signals against Pull Request file metadata.
function runRules(pullRequest) {
  const findings = [];
  const changedPaths = pullRequest.changedFiles.map((file) => file.path);
  const changedText = pullRequest.changedFiles.map((file) => file.patch).join('\n');
  const testFiles = changedPaths.filter((path) => /test|spec/i.test(path));
  const sensitiveFiles = changedPaths.filter((path) => /auth|permission|secret|token|password|database|migration/i.test(path));
  const apiFiles = changedPaths.filter((path) => /route|controller|api|schema|service/i.test(path));

  if (apiFiles.length > 0) {
    findings.push(
      createFinding(
        'breaking-change',
        'medium',
        'API-facing files changed and should be checked for contract or behavior changes.',
        `Changed API-related files: ${apiFiles.join(', ')}`,
        apiFiles,
        'Confirm callers, response shapes, and backward compatibility.'
      )
    );
  }

  if (sensitiveFiles.length > 0 || /password|token|secret|authorization/i.test(changedText)) {
    findings.push(
      createFinding(
        'security-concern',
        'high',
        'Security-sensitive code or terms changed in this Pull Request.',
        `Security-sensitive files or terms detected near: ${[...sensitiveFiles, ...changedPaths].slice(0, 3).join(', ')}`,
        sensitiveFiles.length > 0 ? sensitiveFiles : changedPaths.slice(0, 3),
        'Inspect data flow, permissions, secret handling, and input validation.'
      )
    );
  }

  if (testFiles.length === 0 && pullRequest.changedFiles.length > 0) {
    findings.push(
      createFinding(
        'test-gap',
        'medium',
        'Application code changed without a matching test or spec file in the Pull Request.',
        'No changed path matched the beta test-file patterns.',
        changedPaths.slice(0, 5),
        'Add or update a focused test for the changed behavior.'
      )
    );
  }

  if (pullRequest.changedFiles.length >= 8) {
    findings.push(
      createFinding(
        'hidden-impact',
        'medium',
        'The Pull Request touches many files, increasing the chance of related impact outside the main diff.',
        `${pullRequest.changedFiles.length} files changed in this Pull Request.`,
        changedPaths.slice(0, 8),
        'Review shared utilities and imports used by the changed files.'
      )
    );
  }

  return findings;
}

export { runRules };