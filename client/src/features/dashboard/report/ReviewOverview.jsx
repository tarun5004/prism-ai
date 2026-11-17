import { Sparkles } from 'lucide-react';
import ReviewReference from './ReviewReference.jsx';

export default function ReviewOverview({ active, review, analysis, files, onNavigate }) {
  const recommendationLabels = {
    changes_requested: 'Changes recommended',
    human_review: 'Human review recommended',
    insufficient_context: 'More context needed',
    no_blocker_found: 'No blocker found in reviewed scope',
  };
  return (
    <div hidden={!active}>
      {review && (
        <section className="report-section contextual-review" aria-labelledby="ai-review-title">
          <p className="section-label">Contextual AI review · advisory</p>
          <h2 id="ai-review-title">What changed and why it matters</h2>
          <p className="review-summary">{review.summary}</p>
          <p className="review-recommendation">
            {recommendationLabels[review.recommendation] || 'Human review required'}
          </p>
          <p className="muted-text">
            This recommendation covers only the supplied context. It is not merge approval; verify findings
            and run your tests.
          </p>
          <h3>Change walkthrough</h3>
          {(review.walkthrough || []).map((item, index) => (
            <article className="review-item" key={index}>
              <h4>{item.filePath}</h4>
              <p>{item.description}</p>
              {(item.evidenceRefs || []).map((reference, refIndex) => (
                <ReviewReference key={refIndex} reference={reference} files={files} onNavigate={onNavigate} />
              ))}
            </article>
          ))}
          <h3>Potential impact</h3>
          {review.impacts?.length ? (
            review.impacts.map((item, index) => (
              <article className="review-item" key={index}>
                <p>{item.description}</p>
                {(item.evidenceRefs || []).map((reference, refIndex) => (
                  <ReviewReference
                    key={refIndex}
                    reference={reference}
                    files={files}
                    onNavigate={onNavigate}
                  />
                ))}
              </article>
            ))
          ) : (
            <p className="muted-text">No additional supported impact was returned for this context.</p>
          )}
          <details className="review-limitations" open>
            <summary>Review limitations</summary>
            <ul>
              {(review.limitations || []).map((limitation, index) => (
                <li key={index}>{limitation}</li>
              ))}
            </ul>
          </details>
        </section>
      )}
      {!review && (
        <div className="review-empty">
          <Sparkles size={25} />
          <h3>No contextual AI review is available</h3>
          <p className="muted-text">
            {analysis.sample
              ? 'This capture retains the recorded finding and diff. Open Findings to inspect them.'
              : 'Check the AI status above. Saved code changes and rule-based findings remain available in this workspace.'}
          </p>
        </div>
      )}
    </div>
  );
}
