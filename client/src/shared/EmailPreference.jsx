export default function EmailPreference({ session, busy, onChange }) {
  return (
    <label
      className="email-preference"
      title={
        session.emailAvailable
          ? 'Send a report link to your verified GitHub email. Reconnect when authorization expires.'
          : 'Email delivery is not configured on this deployment.'
      }
    >
      <span>
        <input
          type="checkbox"
          checked={Boolean(session.emailNotifications)}
          disabled={busy || (!session.emailAvailable && !session.emailNotifications)}
          onChange={(event) => onChange(event.target.checked)}
        />{' '}
        Review-ready emails
      </span>
      {!session.emailAvailable && (
        <small className="email-unavailable">
          {session.emailUnavailableReason || 'Email delivery is not configured on this demo.'}
        </small>
      )}
    </label>
  );
}
