import { useCallback, useEffect, useRef, useState } from 'react';
import DashboardPage from '../features/dashboard/DashboardPage.jsx';
import DemoPage from '../features/dashboard/pages/DemoPage.jsx';
import LandingPage from '../features/landing/LandingPage.jsx';
import RouteLink from '../shared/RouteLink.jsx';
import EmailPreference from '../shared/EmailPreference.jsx';
import useGitHubConnection from '../features/connection/useGitHubConnection.js';
import { githubLoginUrl } from '../features/dashboard/analysis.api.js';
import { resolveRoute } from './routes.js';

function App() {
  const { session, connectionError, connectionBusy, refreshSession, signOut, changeEmailPreference } =
    useGitHubConnection();
  const [pathname, setPathname] = useState(() =>
    typeof window === 'undefined' ? '/' : window.location.pathname,
  );
  const route = resolveRoute(pathname);
  const [workspaceVisited, setWorkspaceVisited] = useState(
    () => !['landing', 'demo'].includes(resolveRoute(pathname).page),
  );
  const lastWorkspaceRoute = useRef(route);
  const navigate = useCallback((path) => {
    const destination = new URL(path, window.location.origin);
    if (destination.origin !== window.location.origin) return;
    if (destination.pathname !== window.location.pathname)
      window.history.pushState(null, '', destination.pathname);
    setPathname(destination.pathname);
  }, []);

  useEffect(() => {
    // Preserve old bookmarks after replacing the one-page anchor navigation.
    if (window.location.pathname === '/' && window.location.hash === '#history') {
      window.history.replaceState(null, '', '/analyses');
      setPathname('/analyses');
    }
    const onPopState = () => setPathname(window.location.pathname);
    window.addEventListener('popstate', onPopState);
    return () => window.removeEventListener('popstate', onPopState);
  }, []);

  useEffect(() => {
    const page = resolveRoute(pathname).page;
    if (page !== 'landing' && page !== 'demo') {
      lastWorkspaceRoute.current = resolveRoute(pathname);
      setWorkspaceVisited(true);
    }
    document.title = `${{ landing: 'Understand every change', demo: 'Recorded review', overview: 'New review', analyses: 'Saved analyses', review: 'PR review', 'not-found': 'Page not found' }[page]} · PRism AI`;
    document
      .querySelector(
        page === 'landing' ? '.landing h1' : page === 'demo' ? '.public-demo h1' : '.dashboard-shell h1',
      )
      ?.focus({ preventScroll: true });
    window.scrollTo(0, 0);
  }, [pathname]);

  return (
    <>
      {route.page !== 'landing' && (session?.enabled || connectionError) && (
        <div className="connection-bar">
          <span>
            {session?.authenticated
              ? `Connected as ${session.login}`
              : 'Connect GitHub to review your installed repositories.'}
          </span>
          {session?.installUrl && <a href={session.installUrl}>Install on GitHub ↗</a>}
          {session?.authenticated ? (
            <button type="button" disabled={connectionBusy} onClick={signOut}>
              Sign out
            </button>
          ) : (
            <a href={githubLoginUrl}>Connect GitHub</a>
          )}
          {session?.authenticated && (
            <EmailPreference session={session} busy={connectionBusy} onChange={changeEmailPreference} />
          )}
          {connectionError && (
            <>
              <span role="alert">{connectionError}</span>
              <button type="button" disabled={connectionBusy} onClick={refreshSession}>
                Retry connection
              </button>
            </>
          )}
        </div>
      )}
      {route.page === 'landing' && (
        <LandingPage
          onNavigate={navigate}
          session={session}
          connectionError={connectionError}
          connectionBusy={connectionBusy}
          onSignOut={signOut}
          onRetry={refreshSession}
          onEmailChange={changeEmailPreference}
        />
      )}
      {route.page === 'demo' && <DemoPage onNavigate={navigate} />}
      {/* Keep an active review mounted when its user visits the introduction. */}
      {(workspaceVisited || !['landing', 'demo'].includes(route.page)) &&
        (session && !session.demoOnly && (!session.enabled || session.authenticated) ? (
          <div hidden={['landing', 'demo'].includes(route.page)}>
            <DashboardPage
              route={['landing', 'demo'].includes(route.page) ? lastWorkspaceRoute.current : route}
              onNavigate={navigate}
              userId={session.userId || 'local'}
            />
          </div>
        ) : (
          !['landing', 'demo'].includes(route.page) && (
            <main className="connection-welcome">
              <h1>GitHub workspace</h1>
              <p role="status">
                {!session
                  ? connectionError || 'Checking connection…'
                  : session.demoOnly
                    ? 'This hosted demo offers a recorded review. Live repository access is disabled.'
                    : 'Install PRism on selected repositories, then connect GitHub to open your private workspace.'}
              </p>
              {session?.enabled && <a href={githubLoginUrl}>Connect GitHub</a>}{' '}
              <RouteLink to="/demo" onNavigate={navigate}>
                Explore recorded review →
              </RouteLink>
            </main>
          )
        ))}
    </>
  );
}

export { resolveRoute, LandingPage, EmailPreference };
export { default as FeatureShowcase } from '../features/landing/FeatureShowcase.jsx';
export default App;
