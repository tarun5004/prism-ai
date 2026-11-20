import { useState } from 'react';
import { AlertTriangle, CheckCircle2, Sparkles } from 'lucide-react';
import DiffViewer from '../DiffViewer.jsx';
import { formatDate, getFailureMessage, getReportTone } from './report.helpers.js';
import AiStatusPanel from './AiStatusPanel.jsx';
import ReviewOverview from './ReviewOverview.jsx';
import FindingsPanel from './FindingsPanel.jsx';
import AgentActivity from './AgentActivity.jsx';
import ReviewApproval from './ReviewApproval.jsx';

export default function AnalysisReport({ analysis, userId = 'local' }) {
  const [activeView, setActiveView] = useState(analysis.sample ? 'findings' : 'overview');
  const [focusLocation, setFocusLocation] = useState(null);
  const findings = analysis.findings || [];
  const aiFindingCount = findings.filter((finding) => finding.source === 'ai').length;
  const ruleSignalCount = findings.filter((finding) => finding.source === 'rule').length;
  const files = analysis.pullRequest?.changedFiles || [];
  const pr = analysis.pullRequest || {};
  const successful = analysis.status === 'completed';
  const statusLabel = successful
    ? analysis.aiStatus === 'completed'
      ? 'Analysis completed'
      : analysis.aiStatus === 'partial'
        ? 'AI review partial'
        : 'Rule-based analysis completed'
    : 'Analysis failed';
  const reportTone = getReportTone(analysis);
  const ReportIcon = reportTone === 'completed' ? CheckCircle2 : AlertTriangle;
  const review =
    successful && ['completed', 'partial'].includes(analysis.aiStatus) ? analysis.aiReview : null;

  return (
    <div className="analysis-workspace">
      {analysis.sample && (
        <section className="sample-notice">
          <strong>Recorded sample · read-only</strong>
          <p>{analysis.sample.description}</p>
        </section>
      )}
      <section className="report-section" aria-labelledby="report-title">
        <div className="section-heading">
          <div>
            <p className="section-label">Review report</p>
            <h2 id="report-title">{pr.title || 'Analysis result'}</h2>
            <p className="muted-text">
              {pr.repository || 'Repository unavailable'}
              {pr.author && ` · opened by ${pr.author}`}
            </p>
          </div>
          <span className={`report-status ${reportTone}`}>
            <ReportIcon size={15} />
            {statusLabel}
          </span>
        </div>
        <div className="revision-meta">
          {analysis.githubFeedback && (
            <span>
              GitHub summary:{' '}
              {{
                posted: 'posted',
                existing: 'already posted for this revision',
                unavailable: 'not delivered; saved review remains available',
                skipped: 'disabled',
              }[analysis.githubFeedback.status] || 'status unknown'}
            </span>
          )}
          {analysis.githubInline && (
            <span>
              Inline findings: {analysis.githubInline.status}
              {analysis.githubInline.errorCode && ` (${analysis.githubInline.errorCode})`}
            </span>
          )}
          {analysis.githubStatus && <span>GitHub advisory status: {analysis.githubStatus.status}</span>}
          <span>{formatDate(analysis.createdAt)}</span>
          {pr.headSha ? (
            <code title={pr.headSha}>
              {pr.headBranch} @ {pr.headSha.slice(0, 8)}
            </code>
          ) : (
            <span>
              {analysis.sample
                ? 'Owned fixture snapshot; no GitHub commit'
                : 'Revision not recorded in this older report'}
            </span>
          )}
          {pr.baseSha && (
            <code title={pr.baseSha}>
              base {pr.baseBranch} @ {pr.baseSha.slice(0, 8)}
            </code>
          )}
          {pr.reviewScope?.mode === 'incremental' && (
            <span>
              Incremental review since {pr.diffBaseSha?.slice(0, 8)}; earlier unchanged code was not reviewed
              again.
            </span>
          )}
          {pr.reviewScope?.excludedPaths?.length > 0 && (
            <span>{pr.reviewScope.excludedPaths.length} file(s) excluded by repository settings.</span>
          )}
        </div>
        {!successful && (
          <p className="error-message" role="alert">
            {getFailureMessage(analysis)}
          </p>
        )}
        {pr.filesComplete === false && (
          <p className="diff-warning">
            File retrieval is incomplete: {files.length} of {pr.totalChangedFiles ?? 'an unknown number of'}{' '}
            files were saved. This report covers only the available files.
          </p>
        )}
        <div className="risk-summary">
          <div>
            <span className="summary-number">{findings.length}</span>
            <span className="summary-label">findings</span>
            <small>{aiFindingCount} AI {aiFindingCount === 1 ? 'finding' : 'findings'} · {ruleSignalCount} rule {ruleSignalCount === 1 ? 'signal' : 'signals'}</small>
          </div>
          <div>
            <span className="summary-number high">
              {findings.filter((finding) => finding.severity === 'high').length}
            </span>
            <span className="summary-label">high attention</span>
          </div>
          <div>
            <span className="summary-number">{files.length}</span>
            <span className="summary-label">files saved</span>
          </div>
          <div>
            <span className="summary-number diff-additions">
              +{files.reduce((sum, file) => sum + (Number.isFinite(file.additions) ? file.additions : 0), 0)}
            </span>
            <span className="summary-label diff-deletions">
              −{files.reduce((sum, file) => sum + (Number.isFinite(file.deletions) ? file.deletions : 0), 0)}{' '}
              lines
            </span>
          </div>
        </div>
      </section>
      <div className="review-workbench">
        <DiffViewer files={files} focusLocation={focusLocation} />
        <aside className="review-sidebar">
          <div className="review-panel-heading">
            <Sparkles size={17} />
            <strong>Review assistant</strong>
            <span className="history-count">Advisory</span>
          </div>
          <nav className="review-views" aria-label="Review views">
            <button
              type="button"
              aria-pressed={activeView === 'overview'}
              aria-controls="review-panel"
              onClick={() => setActiveView('overview')}
            >
              Overview
            </button>
            <button
              type="button"
              aria-pressed={activeView === 'findings'}
              aria-controls="review-panel"
              onClick={() => setActiveView('findings')}
            >
              Findings <span>{findings.length}</span>
            </button>
          </nav>
          <div className="review-panel" id="review-panel" role="region" aria-label="Review panel">
            <AiStatusPanel analysis={analysis} files={files} />
            <AgentActivity agent={analysis.aiDiagnostics?.agent} files={files} onNavigate={setFocusLocation} />
            <ReviewApproval key={analysis.id} analysis={analysis} />

            <ReviewOverview
              active={activeView === 'overview'}
              review={review}
              analysis={analysis}
              files={files}
              onNavigate={setFocusLocation}
            />
            <FindingsPanel
              active={activeView === 'findings'}
              analysis={analysis}
              files={files}
              userId={userId}
              onNavigate={setFocusLocation}
            />
          </div>
        </aside>
      </div>
    </div>
  );
}
