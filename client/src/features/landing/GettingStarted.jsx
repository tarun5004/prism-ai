import { useState } from 'react';
import RouteLink from '../../shared/RouteLink.jsx';

const steps = [
  {
    title: 'Install the GitHub App',
    body: 'Choose the repositories PRism may access. Installing the App and connecting your user account are separate steps.',
    hint: 'Choose selected repositories for a focused trial.',
    color: 'green',
    nodes: ['Your GitHub account', 'Choose repositories', 'Install PRism'],
  },
  {
    title: 'Connect your account',
    body: 'Authorize GitHub so the workspace can identify you and show reports for repositories you can access.',
    hint: 'Use the Connect GitHub control below.',
    color: 'blue',
    nodes: ['Authorize GitHub', 'Identify reviewer', 'Open workspace'],
  },
  {
    title: 'Open or submit a PR',
    body: 'Eligible pull request events can trigger a review. You can also paste a PR URL into the workspace and select Analyze PR.',
    hint: 'The App must be installed on that repository.',
    color: 'orange',
    nodes: ['PR event or URL', 'Durable review job', 'Worker starts'],
  },
  {
    title: 'Inspect the saved report',
    body: 'Follow the diff, inspect evidence and read the AI status. Useful or incorrect feedback helps document your judgment.',
    hint: 'A saved report belongs to an exact revision.',
    color: 'lilac',
    nodes: ['Saved revision', 'Inspect evidence', 'Leave feedback'],
  },
];

export default function GettingStarted({ onNavigate }) {
  const [selected, setSelected] = useState(0);
  return (
    <section
      id="getting-started"
      className="section-block getting-started"
      aria-labelledby="getting-started-heading"
    >
      <div className="editorial-heading">
        <div>
          <p className="landing-eyebrow">04 / FROM PR TO PERSPECTIVE</p>
          <h2 id="getting-started-heading">
            Your first review.
            <br />
            <span className="serif-word">Four simple steps.</span>
          </h2>
        </div>
        <RouteLink className="quiet-link" to="/demo" onNavigate={onNavigate}>
          Or explore a recorded review ↗
        </RouteLink>
      </div>
      <div className="onboarding-layout">
        <ol className="onboarding-steps" aria-label="Getting started steps">
          {steps.map((step, index) => (
            <li key={step.title}>
              <button
                type="button"
                data-color={step.color}
                aria-pressed={selected === index}
                aria-controls="onboarding-detail"
                onClick={() => setSelected(index)}
                onFocus={() => setSelected(index)}
                onPointerEnter={(event) => {
                  if (event.pointerType === 'mouse') setSelected(index);
                }}
              >
                <span>0{index + 1}</span>
                <strong>{step.title}</strong>
                <span aria-hidden="true">↗</span>
              </button>
            </li>
          ))}
        </ol>
        <div
          className="onboarding-detail"
          data-color={steps[selected].color}
          id="onboarding-detail"
          aria-live="polite"
          aria-atomic="true"
        >
          <span className="step-watermark" aria-hidden="true">
            0{selected + 1}
          </span>
          <div className="step-enter" key={selected}>
            <span className="landing-eyebrow">STEP 0{selected + 1} / 04</span>
            <h3>{steps[selected].title}</h3>
            <p>{steps[selected].body}</p>
            <small>{steps[selected].hint}</small>
            <div className="onboarding-mini-flow" aria-label="Selected onboarding flow">
              {steps[selected].nodes.map((node, index) => (
                <span key={node}>
                  <i>0{index + 1}</i>
                  {node}
                </span>
              ))}
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
