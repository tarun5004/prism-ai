import { findDiffLocation } from '../DiffViewer.jsx';

export default function ReviewReference({ reference, files, onNavigate }) {
  const location = findDiffLocation(files, reference);
  return (
    <div className="review-reference">
      {location ? (
        <button type="button" className="text-button" onClick={() => onNavigate({ ...reference })}>
          View {reference.lineSide || 'new'} line {reference.lineNumber} in diff · {reference.filePath}
        </button>
      ) : (
        <span className="muted-text">
          Source context · {reference.filePath}:{reference.lineNumber} ({reference.lineSide || 'new'})
        </span>
      )}
      <pre className="finding-evidence">
        <code>{reference.evidence}</code>
      </pre>
    </div>
  );
}
