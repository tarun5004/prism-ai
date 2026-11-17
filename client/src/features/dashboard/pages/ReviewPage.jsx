import { AlertTriangle, ArrowUpRight, GitPullRequest, LoaderCircle, Sparkles } from 'lucide-react';
import RouteLink from '../../../shared/RouteLink.jsx';
import AnalysisReport from '../report/AnalysisReport.jsx';

export default function ReviewPage({ analysis, error, onRetry, onNavigate, userId, pendingStage }) {
  return (
    <>
      <RouteLink className="text-button back-link" to="/analyses" onNavigate={onNavigate}>
        ← All analyses
      </RouteLink>
      {error ? (
        <section className="welcome-section" role="alert">
          <AlertTriangle size={21} />
          <div>
            <h2>Report could not be opened</h2>
            <p className="muted-text">{error}</p>
            <button type="button" className="text-button" onClick={onRetry}>
              Try again
            </button>
          </div>
        </section>
      ) : analysis ? (
        <AnalysisReport key={analysis.id} analysis={analysis} userId={userId} />
      ) : ['queued', 'running'].includes(pendingStage) ? (
        <section className="welcome-section" role="status">
          <LoaderCircle className="spin" size={18} />
          <div>
            <h2>{pendingStage === 'queued' ? 'Review queued' : 'Review running'}</h2>
            <p>You can close this page and reopen this URL later. Accepted work continues on the server.</p>
          </div>
        </section>
      ) : (
        <p className="report-loading muted-text" role="status">
          <LoaderCircle className="spin" size={18} />
          Loading saved report…
        </p>
      )}
    </>
  );
}
