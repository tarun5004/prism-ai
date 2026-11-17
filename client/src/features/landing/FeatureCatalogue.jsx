import { Braces, ScanLine, AlignLeft, GitCompareArrows, MessageSquare, History } from 'lucide-react';
import OptionalIntegrations from './OptionalIntegrations.jsx';
import { moveSpotlight } from './pointerEffects.js';

const capabilities = [
  {
    icon: Braces,
    title: 'Bounded code context',
    text: 'Nearby source windows and selected direct imports enrich the diff. Coverage and omissions stay visible.',
    tag: 'CONTEXT',
    color: 'blue',
    example:
      'Change a guard → inspect its surrounding function and selected imports, not just the edited line.',
  },
  {
    icon: ScanLine,
    title: 'Evidence at the line',
    text: 'Inspect file paths, old/new line references and saved evidence. Jump from a finding straight to the diff.',
    tag: 'REVIEW',
    color: 'coral',
    example: 'A removed authorization check can point to the old-side diff line where the guard disappeared.',
  },
  {
    icon: AlignLeft,
    title: 'Summary & walkthrough',
    text: 'Understand PR intent, per-file changes and potential impact alongside the supporting code.',
    tag: 'UNDERSTAND',
    color: 'yellow',
    example:
      'See what each supplied file changes, why it may matter, and the code supporting that explanation.',
  },
  {
    icon: GitCompareArrows,
    title: 'Incremental revisions',
    text: 'Eligible follow-up reviews focus on changes since a prior reviewed revision, with scope disclosed.',
    tag: 'REVISIT',
    color: 'green',
    example: 'Push a follow-up commit → an eligible review compares against the previous reviewed revision.',
  },
  {
    icon: MessageSquare,
    title: 'Feedback memory',
    text: 'Mark findings useful or incorrect. Relevant historical feedback can inform later reviews; current evidence is still required.',
    tag: 'FEEDBACK',
    color: 'orange',
    example:
      'Mark a false positive incorrect. Feedback stays separate from the original finding and evidence.',
  },
  {
    icon: History,
    title: 'Saved review reports',
    text: 'Reopen the exact revision, diff, findings and AI status. Rules remain available when the model cannot finish.',
    tag: 'TRACEABILITY',
    color: 'lilac',
    example:
      'Return tomorrow → reopen the saved SHA, diff and actual model status, even if the PR has moved on.',
  },
];

export default function FeatureCatalogue() {
  return (
    <section id="features" className="section-block capability-section" aria-labelledby="capability-heading">
      <div className="editorial-heading">
        <div>
          <p className="landing-eyebrow">03 / A CLOSER LOOK</p>
          <h2 id="capability-heading">
            More than a<br />
            <span className="serif-word">comment on your code.</span>
          </h2>
        </div>
        <p>
          Context, evidence and a review you can revisit.
          <br />
          Built around the pull request you actually changed.
        </p>
      </div>
      <div className="capability-grid">
        {capabilities.map(({ icon: Icon, title, text, tag, color, example }, index) => (
          <article className="color-card" data-color={color} key={title} onPointerMove={moveSpotlight}>
            <div className="capability-meta">
              <Icon size={24} strokeWidth={1.5} />
              <span>
                0{index + 1} / {tag}
              </span>
            </div>
            <h3>{title}</h3>
            <p>{text}</p>
            <p className="capability-example">
              <span>IN PRACTICE</span>
              {example}
            </p>
          </article>
        ))}
      </div>
      <OptionalIntegrations />
    </section>
  );
}
