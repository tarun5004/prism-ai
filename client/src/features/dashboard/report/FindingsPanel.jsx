import { useState } from 'react';
import { CheckCircle2 } from 'lucide-react';
import FindingCard from './FindingCard.jsx';

export default function FindingsPanel({ active, analysis, files, userId, onNavigate }) {
  const [sourceFilter, setSourceFilter] = useState('all');
  const [severityFilter, setSeverityFilter] = useState('all');
  const findings = analysis.findings || [];
  const successful = analysis.status === 'completed';
  const visibleFindings = findings.filter(
    (finding) =>
      (sourceFilter === 'all' || finding.source === sourceFilter) &&
      (severityFilter === 'all' || finding.severity === severityFilter),
  );
  return (
    <section hidden={!active} aria-label="Findings">
      {findings.length > 0 && (
        <div className="finding-filters">
          <label>
            Source
            <select value={sourceFilter} onChange={(event) => setSourceFilter(event.target.value)}>
              <option value="all">All findings</option>
              <option value="ai">AI findings</option>
              <option value="rule">Rule-based</option>
            </select>
          </label>
          <label>
            Severity
            <select value={severityFilter} onChange={(event) => setSeverityFilter(event.target.value)}>
              <option value="all">All severities</option>
              <option value="high">High</option>
              <option value="medium">Medium</option>
              <option value="low">Low</option>
            </select>
          </label>
          <span className="muted-text" role="status">
            {visibleFindings.length} of {findings.length} shown
          </span>
        </div>
      )}
      <div className="findings-list">
        {visibleFindings.length === 0 ? (
          <div className="no-findings">
            <CheckCircle2 size={22} />
            <p>
              {findings.length > 0
                ? 'No findings match these filters.'
                : !successful
                  ? 'No completed findings are available.'
                  : analysis.aiStatus === 'completed'
                    ? 'No validated findings were returned. This is advisory and does not guarantee the PR is safe.'
                    : 'No rule-based findings were returned. Check the AI status above.'}
            </p>
          </div>
        ) : (
          visibleFindings.map((finding) => (
            <FindingCard
              key={findings.indexOf(finding)}
              finding={finding}
              findingIndex={findings.indexOf(finding)}
              files={files}
              analysis={analysis}
              userId={userId}
              onNavigate={onNavigate}
            />
          ))
        )}
      </div>
    </section>
  );
}
