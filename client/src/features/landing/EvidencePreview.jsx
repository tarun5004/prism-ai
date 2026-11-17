import { useState } from 'react';
import { ArrowUpRight, FileCode2, GitPullRequest } from 'lucide-react';

const examples = [
  {
    title: 'The condition allows a paused review',
    line: 3,
    category: 'Logic',
    explanation:
      'OR lets either condition pass. The intent says the PR must be ready AND reviews must be active.',
    fix: 'return !isDraft && !reviewsPaused;',
  },
  {
    title: 'An empty list has no average',
    line: 7,
    category: 'Edge case',
    explanation:
      'An empty array gives a count of zero. Decide how callers should handle an empty input before dividing.',
    fix: 'if (numbers.length === 0) return null;',
  },
];
const lines = [
  '// Run only when ready AND not paused.',
  'function shouldReview(isDraft, reviewsPaused) {',
  '  return !isDraft || !reviewsPaused;',
  '}',
  '',
  'function average(numbers) {',
  '  return numbers.reduce((a, b) => a + b, 0) / numbers.length;',
  '}',
];

export default function EvidencePreview() {
  const [selected, setSelected] = useState(0);
  const finding = examples[selected];
  return (
    <section id="review-preview" className="section-block evidence-section" aria-labelledby="preview-heading">
      <div className="section-heading editorial-heading">
        <div>
          <p className="landing-eyebrow">01 / LESS GUESSWORK</p>
          <h2 id="preview-heading">
            Good feedback.
            <br />
            <span className="serif-word">Right beside the code.</span>
          </h2>
        </div>
        <p>
          Click a finding. Follow the evidence.
          <br />A small taste of the review workspace.
        </p>
      </div>
      <div className="evidence-workbench">
        <div className="evidence-title">
          <span>
            <GitPullRequest size={16} /> example / review-policy{' '}
            <span className="example-badge">Illustrative preview</span>
          </span>
          <span>+8 −0</span>
        </div>
        <div className="evidence-columns">
          <div className="evidence-code">
            <div className="evidence-file">
              <FileCode2 size={15} /> review-policy.js <span>NEW</span>
            </div>
            <div className="evidence-code-scroll" role="region" aria-label="Example code" tabIndex={0}>
              <pre>
                {lines.map((line, index) => (
                  <div key={index} data-highlighted={finding.line === index + 1}>
                    <span aria-hidden="true">{index + 1}</span>
                    <code>{line || ' '}</code>
                  </div>
                ))}
              </pre>
            </div>
            <p className="preview-code-note">↑ Highlight follows the selected finding</p>
          </div>
          <div className="evidence-findings">
            <div className="evidence-panel-title">
              PRism review <span>2 examples</span>
            </div>
            <div aria-label="Example review findings">
              {examples.map((item, index) => (
                <button
                  key={item.title}
                  type="button"
                  aria-pressed={selected === index}
                  aria-controls="example-finding-detail"
                  onClick={() => setSelected(index)}
                >
                  <span className="finding-index">0{index + 1}</span>
                  <span>
                    <small>
                      {item.category} · line {item.line}
                    </small>
                    <strong>{item.title}</strong>
                  </span>
                  <ArrowUpRight size={16} />
                </button>
              ))}
            </div>
            <div id="example-finding-detail" aria-live="polite" aria-atomic="true" className="example-detail">
              <p>{finding.explanation}</p>
              <span className="mono-label">SUGGESTED CHECK</span>
              <code>{finding.fix}</code>
            </div>
          </div>
        </div>
        <div className="evidence-caption">
          <span>
            <i /> Interactive example · No API calls
          </span>
          <span>AI feedback is advisory. Verify before merging.</span>
        </div>
      </div>
    </section>
  );
}
