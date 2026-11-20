import RouteLink from '../../shared/RouteLink.jsx';
import EmailPreference from '../../shared/EmailPreference.jsx';
import RepositoryAccessNotice from '../connection/RepositoryAccessNotice.jsx';
import { githubLoginUrl } from '../dashboard/analysis.api.js';

export default function HomeConnection({
  session,
  connectionError,
  connectionBusy,
  onSignOut,
  onRetry,
  onEmailChange,
  onNavigate,
}) {
  return (
    <section id="home-workspace" className="home-workspace" aria-labelledby="home-workspace-title">
      <div>
        <p className="landing-eyebrow">YOUR GITHUB / YOUR PERSPECTIVE</p>
        <h2 id="home-workspace-title">
          {session?.authenticated ? `Connected as ${session.login}` : 'Bring your next pull request.'}
        </h2>
        <p>
          {session?.authenticated
            ? 'Start a review or reopen a saved report for an exact revision.'
            : 'Install on your repositories. Connect your account. See your changes in a new light.'}
        </p>
      </div>
      <div className="home-workspace-actions">
        <RepositoryAccessNotice session={session} busy={connectionBusy} onRetry={onRetry} />
        {session?.enabled && !session.authenticated && (
          <a className="landing-cta" href={githubLoginUrl}>
            Connect GitHub ↗
          </a>
        )}
        {session?.installUrl && (
          <a className="quiet-link" href={session.installUrl}>
            Install on GitHub ↗
          </a>
        )}
        {(session?.authenticated || (session?.enabled === false && !session?.demoOnly)) && (
          <RouteLink className="landing-cta" to="/app" onNavigate={onNavigate}>
            Start a review ↗
          </RouteLink>
        )}
        <RouteLink className="quiet-link" to="/analyses" onNavigate={onNavigate}>
          Saved analyses →
        </RouteLink>
        {session?.authenticated && (
          <>
            <EmailPreference session={session} busy={connectionBusy} onChange={onEmailChange} />
            <button type="button" disabled={connectionBusy} onClick={onSignOut}>
              Sign out
            </button>
          </>
        )}
        {session?.demoOnly && (
          <p>Live repository access is disabled on this deployment. Explore the recorded review.</p>
        )}
        {connectionError && (
          <>
            <p role="alert">{connectionError}</p>
            {session?.authenticated && <a href={githubLoginUrl}>Reconnect GitHub</a>}
            <button type="button" disabled={connectionBusy} onClick={onRetry}>
              Retry connection
            </button>
          </>
        )}
      </div>
    </section>
  );
}
