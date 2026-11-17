import { useState } from 'react';
import { saveFindingFeedback } from '../analysis.api.js';

export default function FindingFeedback({ analysisId, findingIndex, annotation }) {
  const [reason, setReason] = useState(annotation?.reason || '');
  const [verdict, setVerdict] = useState(annotation?.verdict || '');
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');
  async function save(nextVerdict) {
    if (saving) return;
    setSaving(true);
    setMessage('');
    setError('');
    try {
      await saveFindingFeedback(analysisId, findingIndex, nextVerdict, reason);
      setVerdict(nextVerdict);
      setMessage('Feedback saved. Original finding unchanged.');
    } catch (failure) {
      setError(failure.message);
    } finally {
      setSaving(false);
    }
  }
  return (
    <div className="finding-feedback">
      <label>
        Optional feedback reason
        <textarea
          maxLength={500}
          value={reason}
          onChange={(event) => setReason(event.target.value)}
          rows={2}
        />
      </label>
      <div>
        <button
          type="button"
          disabled={saving}
          aria-pressed={verdict === 'useful'}
          onClick={() => save('useful')}
        >
          Useful
        </button>{' '}
        <button
          type="button"
          disabled={saving}
          aria-pressed={verdict === 'incorrect'}
          onClick={() => save('incorrect')}
        >
          Incorrect
        </button>
      </div>
      <span role="status">{saving ? 'Saving feedback…' : message}</span>
      {error && (
        <p role="alert" className="error-message">
          {error}
        </p>
      )}
    </div>
  );
}
