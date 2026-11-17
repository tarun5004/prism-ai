import './showcase.css';
import BrandMark from '../../shared/BrandMark.jsx';

const features = [
  {
    name: 'Review',
    color: 'coral',
    title: 'Feedback grounded in your changes.',
    description:
      'Inspect potential bugs, security issues and logic errors with explanations, suggested fixes and saved code evidence.',
    tag: 'Evidence-backed findings',
    code: ['− return !isDraft || !reviewsPaused;', '+ return !isDraft && !reviewsPaused;'],
    note: 'A finding links back to its file and old or new diff line.',
  },
  {
    name: 'Understand',
    color: 'blue',
    title: 'Read the change. Understand the impact.',
    description:
      'Explore the PR summary, per-file walkthrough and potential effects alongside the code that changed.',
    tag: 'Context and impact',
    code: [
      'PR intent → changed code',
      'Changed source → nearby context',
      'Direct imports → bounded enrichment',
    ],
    note: 'Coverage and limitations stay visible when context is incomplete.',
  },
  {
    name: 'Inspect',
    color: 'yellow',
    title: 'Every addition. Every deletion.',
    description:
      'Navigate changed files and unified patches with old/new line numbers. Unavailable patches are called out clearly.',
    tag: 'Unified diff viewer',
    code: [
      '@@ -12,2 +12,3 @@',
      '− const total = price;',
      '+ const total = price * quantity;',
      '+ return total;',
    ],
    note: 'Added and deleted lines remain distinct across multiple hunks.',
  },
  {
    name: 'Revisit',
    color: 'green',
    title: 'A review worth coming back to.',
    description:
      'Reopen saved analyses and inspect the exact PR revision, findings and AI status behind each report.',
    tag: 'Saved revisions',
    code: ['PR URL → GitHub revision', 'Review → validated evidence', 'Saved report → revision + AI status'],
    note: 'Rule-based results remain available when AI is unavailable.',
  },
];

function FeaturePreview({ feature }) {
  return (
    <div className="product-preview">
      <div className="preview-bar">
        <span>
          <span className="preview-dot" /> PRism AI / pull request review
        </span>
        <span>Illustrative preview</span>
      </div>
      <div className="preview-body">
        <aside className="preview-files">
          <span className="mono-label">REVIEW WORKSPACE</span>
          <strong>Files & context</strong>
          <span>src/session.js</span>
          <span>src/session.test.js</span>
          <span className="preview-chip">Diff preserved</span>
        </aside>
        <div className="preview-review">
          <div className="preview-review-heading">
            <BrandMark />
            <span>
              PRism review <small> / {feature.name}</small>
            </span>
          </div>
          <span className="preview-chip">{feature.tag}</span>
          <h3>{feature.title}</h3>
          <div className="preview-code">
            {feature.code.map((line, index) => (
              <div
                className={
                  line.startsWith('+') ? 'preview-added' : line.startsWith('−') ? 'preview-deleted' : ''
                }
                key={index}
              >
                <span aria-hidden="true">{index + 12}</span>
                <code>{line}</code>
              </div>
            ))}
          </div>
          <p>{feature.description}</p>
          <p className="preview-note">↳ {feature.note}</p>
          <small>Example only · AI feedback is advisory</small>
        </div>
      </div>
    </div>
  );
}

function FeatureShowcase({ activeIndex, onSelect }) {
  return (
    <section className="landing-showcase landing-width" aria-label="Explore PRism features">
      {features.map((feature, index) => (
        <article
          className="showcase-card"
          data-expanded={activeIndex === index}
          data-color={feature.color}
          key={feature.name}
          onPointerEnter={(event) => {
            if (event.pointerType !== 'touch') onSelect(index);
          }}
        >
          <button
            type="button"
            className="showcase-card-trigger"
            aria-expanded={activeIndex === index}
            aria-controls={`feature-card-${index}`}
            onFocus={() => onSelect(index)}
            onClick={() => onSelect(index)}
          >
            <span>0{index + 1}</span>
            <strong>{feature.name}</strong>
            <span aria-hidden="true">↗</span>
          </button>
          <p className="showcase-teaser">{feature.description}</p>
          <div
            id={`feature-card-${index}`}
            aria-hidden={activeIndex !== index}
            inert={activeIndex !== index}
            className="showcase-card-content"
          >
            <div className="showcase-card-inner">
              <FeaturePreview feature={feature} />
            </div>
          </div>
        </article>
      ))}
    </section>
  );
}

export default FeatureShowcase;
