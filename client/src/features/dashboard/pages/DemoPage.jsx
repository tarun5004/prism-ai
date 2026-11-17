import { useEffect, useState } from 'react';
import RouteLink from '../../../shared/RouteLink.jsx';
import { loadDemoAnalysis } from '../analysis.api.js';
import AnalysisReport from '../report/AnalysisReport.jsx';

export default function DemoPage({ onNavigate }) {
  const [report, setReport] = useState(null);
  const [error, setError] = useState('');
  const [attempt, setAttempt] = useState(0);
  useEffect(() => {
    const controller = new AbortController();
    setError('');
    setReport(null);
    loadDemoAnalysis({ signal: controller.signal })
      .then((value) => {
        if (!controller.signal.aborted) setReport(value);
      })
      .catch((failure) => {
        if (!controller.signal.aborted) setError(failure.message);
      });
    return () => controller.abort();
  }, [attempt]);
  return (
    <main className="public-demo">
      <RouteLink to="/" onNavigate={onNavigate} className="text-button">
        ← PRism AI home
      </RouteLink>
      <h1>Explore a recorded review</h1>
      {error ? (
        <section role="alert">
          <p>{error}</p>
          <button type="button" className="text-button" onClick={() => setAttempt((value) => value + 1)}>
            Retry sample
          </button>
        </section>
      ) : report ? (
        <AnalysisReport analysis={report} />
      ) : (
        <p role="status">Loading recorded review…</p>
      )}
    </main>
  );
}
