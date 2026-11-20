// Account authorization and repository installation grant different access.
export default function RepositoryAccessNotice({ session, busy, onRetry }) {
  if (!session?.authenticated || !Number.isInteger(session.repositoryCount)) return null;
  if (session.repositoryCount > 0) return (
    <small role="status">
      {session.repositoryCount} {session.repositoryCount === 1 ? 'repository' : 'repositories'} available for review.
    </small>
  );
  return (
    <span className="repository-access-notice" role="status">
      No accessible repositories. Install PRism on the target repository, then retry connection.{' '}
      <button type="button" disabled={busy} onClick={onRetry}>Retry connection</button>
    </span>
  );
}
