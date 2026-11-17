import { AlertTriangle, ArrowUpRight, GitPullRequest, LoaderCircle, Sparkles } from 'lucide-react';
import RouteLink from '../../../shared/RouteLink.jsx';
import AnalysisProgress from '../components/AnalysisProgress.jsx';
import WorkspaceCapabilities from '../components/WorkspaceCapabilities.jsx';

export default function OverviewPage({
  pullRequestUrl = '',
  onUrlChange,
  onSubmit,
  isSubmitting,
  error,
  progressStage,
  elapsedSeconds,
  receivedStages,
  onNavigate,
}) {
  return (
    <div className="overview-content">
      <section className="submit-panel" aria-labelledby="submit-title">
        <div className="panel-heading">
          <div className="heading-icon">
            <GitPullRequest size={20} />
          </div>
          <div>
            <p className="section-label">New review</p>
            <h2 id="submit-title">Open a pull request</h2>
          </div>
        </div>
        <form className="submit-form" onSubmit={onSubmit} aria-busy={isSubmitting}>
          <label htmlFor="pull-request-url">GitHub Pull Request URL</label>
          <div className="input-row">
            <input
              id="pull-request-url"
              type="url"
              placeholder="https://github.com/org/repository/pull/42"
              value={pullRequestUrl}
              onChange={(event) => onUrlChange(event.target.value)}
              disabled={isSubmitting}
              required
            />
            <button type="submit" disabled={isSubmitting}>
              {isSubmitting ? <LoaderCircle className="spin" size={17} /> : <ArrowUpRight size={17} />}
              {isSubmitting ? 'Review in progress…' : 'Analyze PR'}
            </button>
          </div>
          {error && (
            <p className="error-message" role="alert">
              <AlertTriangle size={16} />
              {error}
            </p>
          )}
        </form>
        {isSubmitting && (
          <AnalysisProgress
            stage={progressStage}
            elapsedSeconds={elapsedSeconds}
            visitedStages={receivedStages}
          />
        )}
      </section>
      <WorkspaceCapabilities />
      <section className="welcome-section">
        <div className="welcome-icon">
          <Sparkles size={24} />
        </div>
        <div>
          <h2>One PR. A clearer review.</h2>
          <p className="muted-text">
            Read the diff, understand potential impact and inspect findings with code evidence. AI feedback
            remains advisory.
          </p>
          <RouteLink className="text-button" to="/analyses" onNavigate={onNavigate}>
            Browse saved analyses <ArrowUpRight size={15} />
          </RouteLink>
        </div>
      </section>
    </div>
  );
}
