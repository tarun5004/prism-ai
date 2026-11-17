import { useState } from 'react';
import BrandMark from '../../shared/BrandMark.jsx';
import RouteLink from '../../shared/RouteLink.jsx';
import { moveSpotlight } from './pointerEffects.js';

const perspectives = [
  {
    label: 'Read the change',
    color: 'coral',
    title: 'Change your',
    emphasis: 'perspective.',
    text: 'See the actual diff. Inspect the finding. Make your own call.',
    signal: '01 / DIFF → EVIDENCE',
    href: '#review-preview',
    link: 'Explore the evidence preview',
  },
  {
    label: 'Follow the context',
    color: 'blue',
    title: 'Look a little',
    emphasis: 'closer.',
    text: 'Follow nearby source, selected imports and the limits of what was supplied.',
    signal: '02 / SOURCE → CONTEXT',
    href: '#context-pipeline',
    link: 'Explore the context pipeline',
  },
  {
    label: 'Keep the insight',
    color: 'green',
    title: 'Keep your',
    emphasis: 'perspective.',
    text: 'Return to a saved revision, its evidence and the AI outcome that actually happened.',
    signal: '03 / REVIEW → SAVED REPORT',
    href: '/demo',
    link: 'Open a recorded review',
  },
];

export function ClosingPerspective({ onNavigate }) {
  const [selected, setSelected] = useState(0);
  const perspective = perspectives[selected];
  return (
    <>
      <section
        className="landing-final-cta"
        data-color={perspective.color}
        onPointerMove={moveSpotlight}
      >
        <div className="closing-switch" aria-label="Choose a closing perspective">
          {perspectives.map((item, index) => (
            <button
              type="button"
              key={item.label}
              data-color={item.color}
              aria-pressed={selected === index}
              aria-controls="closing-perspective"
              onPointerEnter={(event) => {
                if (event.pointerType === 'mouse') setSelected(index);
              }}
              onFocus={() => setSelected(index)}
              onClick={() => setSelected(index)}
            >
              <span>0{index + 1}</span>
              {item.label}
              <span aria-hidden="true">↗</span>
            </button>
          ))}
        </div>
        <div className="closing-content">
          <div id="closing-perspective" aria-live="polite" aria-atomic="true">
            <div className="step-enter" key={selected}>
              <p className="landing-eyebrow">YOUR NEXT PR DESERVES A CLOSER LOOK.</p>
              <h2>
                {perspective.title}
                <br />
                <span className="serif-word">{perspective.emphasis}</span>
              </h2>
              <p className="closing-description">{perspective.text}</p>
            </div>
            <div className="closing-actions">
              <RouteLink className="landing-cta" to="/app" onNavigate={onNavigate}>
                Try it for free <span aria-hidden="true">↗</span>
              </RouteLink>
              <RouteLink
                className="quiet-link"
                to={perspective.href}
                onNavigate={perspective.href.startsWith('/') ? onNavigate : undefined}
              >
                {perspective.link} ↗
              </RouteLink>
            </div>
          </div>
          <div className="closing-emblem" aria-hidden="true">
            <div className="closing-beams">
              <i />
              <i />
              <i />
              <i />
              <i />
              <i />
            </div>
            <BrandMark />
            <span>{perspective.signal}</span>
          </div>
        </div>
      </section>
    </>
  );
}

export default function LandingFooter({ onNavigate }) {
  return (
    <footer className="landing-footer landing-width">
      <div className="footer-links">
        <RouteLink className="brand-lockup" to="/" onNavigate={onNavigate}>
          <BrandMark />
          PRism AI
        </RouteLink>
        <div>
          <a href="#features">Features ↗</a>
          <a href="#getting-started">How to use ↗</a>
          <a href="#architecture">Azure architecture ↗</a>
        </div>
        <div>
          <RouteLink to="/analyses" onNavigate={onNavigate}>
            Saved analyses ↗
          </RouteLink>
          <a href="https://github.com/tarun5004/prism-ai" target="_blank" rel="noopener noreferrer">
            View source ↗
          </a>
          <RouteLink to="/demo" onNavigate={onNavigate}>
            Recorded review ↗
          </RouteLink>
        </div>
      </div>
      <div className="footer-wordmark" aria-hidden="true">
        {'PRism'.split('').map((letter, index) => (
          <span
            className="footer-letter"
            data-color={['coral', 'yellow', 'blue', 'orange', 'green'][index]}
            key={index}
          >
            {letter}
          </span>
        ))}
        <span className="footer-spark">✳</span>
      </div>
      <div className="footer-bottom">
        <span>Built by Tarun · Full-stack + AI engineering</span>
        <span>Personal demo. AI feedback is advisory.</span>
      </div>
    </footer>
  );
}
