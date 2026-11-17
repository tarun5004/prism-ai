import { AlertTriangle, ArrowUpRight, GitPullRequest, LoaderCircle, Sparkles } from 'lucide-react';
import RouteLink from '../../../shared/RouteLink.jsx';
import { formatDate } from '../report/report.helpers.js';

export default function AnalysesPage({ reports = [], status = 'loading', error, onReload, onNavigate }) {
  return (
    <section className="history-section" aria-busy={status === 'loading'}>
      <div className="section-heading">
        <div>
          <p className="section-label">History</p>
          <h2>Recent analyses</h2>
        </div>
        <span className="history-count">{reports.length} shown</span>
      </div>
      {status === 'loading' && (
        <p className="muted-text" role="status">
          Loading saved reports…
        </p>
      )}
      {status === 'error' && (
        <div className="history-error" role="alert">
          <p className="error-message">{error}</p>
          <button className="text-button" type="button" onClick={onReload}>
            Reload history
          </button>
        </div>
      )}
      {status === 'ready' && reports.length === 0 && (
        <div className="empty-state">
          <p className="muted-text">No saved reports yet.</p>
          <RouteLink className="text-button" to="/app" onNavigate={onNavigate}>
            Start your first review
          </RouteLink>
        </div>
      )}
      <div className="history-list">
        {reports.map((item) => (
          <RouteLink
            className="history-item"
            to={'/analyses/' + encodeURIComponent(item.id)}
            onNavigate={onNavigate}
            key={item.id}
          >
            <span>
              <strong>{item.pullRequest?.title || 'Failed analysis'}</strong>
              <small>{item.pullRequest?.repository || item.pullRequest?.url}</small>
              <small>
                {formatDate(item.createdAt)}
                {item.pullRequest?.headSha && ` · ${item.pullRequest.headSha.slice(0, 8)}`}
              </small>
            </span>
            <span className={`history-status ${item.status}`}>
              {item.status === 'failed'
                ? 'Failed'
                : item.aiStatus === 'completed'
                  ? 'AI completed'
                  : item.aiStatus === 'partial'
                    ? 'AI partial'
                    : 'Rules completed'}
            </span>
          </RouteLink>
        ))}
      </div>
    </section>
  );
}
