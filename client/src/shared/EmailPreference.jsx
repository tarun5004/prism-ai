export default function EmailPreference({ session, busy, onChange }) {
  return (
    <label
      title={
        session.emailAvailable
          ? 'Send a report link to your verified GitHub email. Reconnect when authorization expires.'
          : 'Email delivery is not configured on this deployment.'
      }
    >
      <input
        type="checkbox"
        checked={Boolean(session.emailNotifications)}
        disabled={busy || !session.emailAvailable}
        onChange={(event) => onChange(event.target.checked)}
      />{' '}
      Review-ready emails
    </label>
  );
}
