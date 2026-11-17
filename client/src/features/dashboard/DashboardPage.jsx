import { ClipboardCheck, GitPullRequest, LoaderCircle, Sparkles } from 'lucide-react';
import BrandMark from '../../shared/BrandMark.jsx';
import RouteLink from '../../shared/RouteLink.jsx';
import useReviewWorkspace from './useReviewWorkspace.js';
import OverviewPage from './pages/OverviewPage.jsx';
import AnalysesPage from './pages/AnalysesPage.jsx';
import ReviewPage from './pages/ReviewPage.jsx';

function DashboardPage({ route = { page: 'overview' }, onNavigate, userId }) {
  const {
    pullRequestUrl,
    setPullRequestUrl,
    recentAnalyses,
    isSubmitting,
    reportError,
    setReportReload,
    errorMessage,
    historyStatus,
    historyError,
    receivedStages,
    progressStage,
    elapsedSeconds,
    refreshHistory,
    submitAnalysis,
    analysis,
  } = useReviewWorkspace(route, onNavigate);
  const pageTitles = {
    overview: 'Start a new review',
    analyses: 'Saved analyses',
    review: 'Pull request review',
    'not-found': 'Page not found',
  };
  const currentReport = route.page === 'review' && analysis?.id === route.analysisId ? analysis : null;
  return (
    <div className="app-frame">
      <aside className="sidebar">
        <RouteLink className="brand-lockup" to="/" onNavigate={onNavigate}>
          <BrandMark />
          <span>PRism</span>
        </RouteLink>
        <nav className="sidebar-nav" aria-label="Primary navigation">
          <RouteLink
            className={`nav-item${route.page === 'overview' ? ' active' : ''}`}
            aria-current={route.page === 'overview' ? 'page' : undefined}
            to="/app"
            onNavigate={onNavigate}
          >
            <ClipboardCheck size={17} />
            New review
          </RouteLink>
          <RouteLink
            className={`nav-item${['analyses', 'review'].includes(route.page) ? ' active' : ''}`}
            aria-current={route.page === 'analyses' ? 'page' : undefined}
            to="/analyses"
            onNavigate={onNavigate}
          >
            <GitPullRequest size={17} />
            Analyses
          </RouteLink>
        </nav>
        {isSubmitting ? (
          <RouteLink className="running-review" to="/app" onNavigate={onNavigate}>
            <LoaderCircle className="spin" size={15} />
            Review in progress
          </RouteLink>
        ) : (
          <div className="sidebar-note">
            <Sparkles size={16} />
            <span>Review support for the changes that matter.</span>
          </div>
        )}
      </aside>
      <main className={`dashboard-shell page-${route.page}`}>
        <header className="topbar">
          <div>
            <p className="eyebrow">Workspace / {route.page === 'overview' ? 'New review' : 'Analyses'}</p>
            <h1 tabIndex={-1}>{pageTitles[route.page] || 'Page not found'}</h1>
            <p className="muted-text">
              {route.page === 'overview'
                ? 'Bring a pull request into focus with code changes and grounded feedback.'
                : route.page === 'analyses'
                  ? 'Reopen a saved report and inspect its exact revision.'
                  : 'Inspect the saved diff, context and advisory findings.'}
            </p>
          </div>
          <span className="beta-badge">
            V0 <span className="status-dot" />
          </span>
        </header>
        {route.page === 'overview' && (
          <OverviewPage
            pullRequestUrl={pullRequestUrl}
            onUrlChange={setPullRequestUrl}
            onSubmit={submitAnalysis}
            isSubmitting={isSubmitting}
            error={errorMessage}
            progressStage={progressStage}
            elapsedSeconds={elapsedSeconds}
            receivedStages={receivedStages}
            onNavigate={onNavigate}
          />
        )}
        {route.page === 'analyses' && (
          <AnalysesPage
            reports={recentAnalyses}
            status={historyStatus}
            error={historyError}
            onReload={refreshHistory}
            onNavigate={onNavigate}
          />
        )}
        {route.page === 'review' && (
          <ReviewPage
            userId={userId}
            analysis={currentReport}
            pendingStage={progressStage}
            error={reportError?.analysisId === route.analysisId ? reportError.message : ''}
            onRetry={() => setReportReload((value) => value + 1)}
            onNavigate={onNavigate}
          />
        )}
        {route.page === 'not-found' && (
          <section className="welcome-section">
            <div>
              <h2>This page does not exist</h2>
              <p className="muted-text">Choose a destination from the navigation or start a new review.</p>
              <RouteLink className="text-button" to="/app" onNavigate={onNavigate}>
                Back to new review
              </RouteLink>
            </div>
          </section>
        )}
      </main>
    </div>
  );
}

// Compatibility exports for existing consumers; implementations live with their feature.
export { default as AnalysisReport } from './report/AnalysisReport.jsx';
export { default as AnalysisProgress } from './components/AnalysisProgress.jsx';
export { default as DemoPage } from './pages/DemoPage.jsx';
export { getAiStatusDetails } from './report/report.helpers.js';
export { OverviewPage, AnalysesPage, ReviewPage, RouteLink };
export default DashboardPage;
