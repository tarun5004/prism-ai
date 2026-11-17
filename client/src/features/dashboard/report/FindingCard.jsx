import { ArrowUpRight, FileCode2, ShieldAlert } from 'lucide-react';
import { findDiffLocation } from '../DiffViewer.jsx';
import FindingFeedback from './FindingFeedback.jsx';

export default function FindingCard({ finding, findingIndex, files, analysis, userId, onNavigate }) {
  const location = findDiffLocation(files, finding);
  return (
    <article className="finding-card">
      <div className={`finding-icon ${finding.severity}`}>
        <ShieldAlert size={18} />
      </div>
      <div className="finding-content">
        <div className="finding-meta">
          <span className="finding-category">
            {finding.source === 'ai'
              ? 'AI review'
              : finding.source === 'rule'
                ? 'Rule-based'
                : 'Saved finding'}
          </span>
          <span className={`severity ${finding.severity}`}>{finding.severity}</span>
        </div>
        <h3>{finding.title || finding.category?.replaceAll('-', ' ') || 'Review finding'}</h3>
        <p>{finding.explanation}</p>
        {finding.evidence && (
          <pre className="finding-evidence">
            <code>{finding.evidence}</code>
          </pre>
        )}
        <div className="affected-files">
          <FileCode2 size={14} />
          {finding.filePath || finding.affectedFiles?.join(' · ') || 'Location not recorded'}
        </div>
        {location ? (
          <button
            type="button"
            className="text-button"
            onClick={() =>
              onNavigate({
                filePath: finding.filePath,
                lineNumber: finding.lineNumber,
                lineSide: finding.lineSide || 'new',
              })
            }
          >
            View {finding.lineSide || 'new'} line {finding.lineNumber} in diff <ArrowUpRight size={14} />
          </button>
        ) : (
          finding.filePath && <p className="location-note">A matching saved diff line is unavailable.</p>
        )}
        <div className="action-line">
          <span>Suggested check</span>
          {finding.suggestedFix || finding.recommendedAction || 'Verify the finding before making changes.'}
        </div>
        {!analysis.sample?.readOnly && (
          <FindingFeedback
            key={`${analysis.id}-${findingIndex}-${userId}`}
            analysisId={analysis.id}
            findingIndex={findingIndex}
            annotation={analysis.feedback?.[`${findingIndex}_${userId}`]}
          />
        )}
      </div>
    </article>
  );
}
