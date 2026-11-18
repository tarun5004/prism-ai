import { useRef, useState } from 'react';
import { decidePublication } from '../analysis.api.js';

export default function ReviewApproval({ analysis }) {
  const [publication, setPublication] = useState(analysis.publication);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const inFlight = useRef(false);
  if (!publication?.status || analysis.sample) return null;
  async function decide(decision) {
    if (inFlight.current) return;
    inFlight.current = true; setBusy(true); setError('');
    try { setPublication((await decidePublication(analysis.id, decision)).publication); }
    catch (failure) { setError(failure.message); }
    finally { inFlight.current = false; setBusy(false); }
  }
  return (
    <section className="review-approval" aria-label="GitHub summary approval">
      <h3>GitHub summary</h3>
      <p>Only this fixed summary can be posted. Source code and finding text stay in the saved report. Repository write access is checked again.</p>
      {typeof publication.preview === 'string' && <pre>{publication.preview.replace(/^<!--[^\n]*-->\n/, '')}</pre>}
      <p role="status">Status: {publication.status}{busy ? ' · checking GitHub…' : ''}</p>
      {publication.status === 'pending' && publication.preview && (
        <div className="approval-actions">
          <button type="button" className="primary-button" disabled={busy} onClick={() => decide('approve')}>Approve summary</button>
          <button type="button" className="secondary-button" disabled={busy} onClick={() => decide('reject')}>Reject</button>
        </div>
      )}
      {['unknown', 'publishing'].includes(publication.status) && <>
        <p>The write may have completed. Check GitHub or reconcile below; Prism will not submit the comment again.</p>
        <button type="button" className="secondary-button" disabled={busy} onClick={() => decide('approve')}>Check GitHub status</button>
      </>}
      {publication.status === 'publishing' && <p>Publication is in progress. Reload to check the saved result. After three minutes, a new approval request only reconciles status.</p>}
      {publication.errorCode === 'PUBLICATION_CONFIGURATION' && <p>Summary publishing requires deployment configuration.</p>}
      {error && <p className="error-message" role="alert">{error} Reload this report before another action.</p>}
    </section>
  );
}
