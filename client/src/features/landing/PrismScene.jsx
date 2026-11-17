import { useEffect, useRef, useState } from 'react';
import PipMascot from './PipMascot.jsx';
import './styles/thought-scene.css';

const thoughts = [
  {
    label: 'Read the diff',
    color: 'coral',
    title: 'One operator. A different outcome.',
    text: 'The new line uses OR. A paused repository can still pass the check.',
    code: 'return !isDraft || !reviewsPaused;',
    badge: '01 / CHANGED CODE',
  },
  {
    label: 'Find the context',
    color: 'blue',
    title: 'What was this code meant to do?',
    text: 'The nearby comment says both conditions must hold. That intent gives the changed line meaning.',
    code: '// Ready AND reviews are active.',
    badge: '02 / NEARBY SOURCE',
  },
  {
    label: 'Inspect the insight',
    color: 'green',
    title: 'A finding you can follow back.',
    text: 'Check the operator against the intended policy, then inspect the referenced line before changing it.',
    code: 'return !isDraft && !reviewsPaused;',
    badge: '03 / ADVISORY INSIGHT',
  },
];

export default function PrismScene() {
  const [selected, setSelected] = useState(0);
  const [greeting, setGreeting] = useState(false);
  const greetingTimer = useRef(null);
  const thought = thoughts[selected];
  useEffect(() => () => clearTimeout(greetingTimer.current), []);

  function greet() {
    clearTimeout(greetingTimer.current);
    setGreeting(true);
    greetingTimer.current = setTimeout(() => setGreeting(false), 1800);
  }
  function tilt(event) {
    if (event.pointerType !== 'mouse' || window.matchMedia('(prefers-reduced-motion: reduce)').matches)
      return;
    const bounds = event.currentTarget.getBoundingClientRect();
    const x = (event.clientX - bounds.left) / bounds.width - 0.5;
    const y = (event.clientY - bounds.top) / bounds.height - 0.5;
    for (const [name, value] of Object.entries({
      '--look-x': `${x * 12}px`,
      '--look-y': `${y * 8}px`,
      '--tilt-x': `${y * -5}deg`,
      '--tilt-y': `${x * 7}deg`,
    }))
      event.currentTarget.style.setProperty(name, value);
  }
  function resetTilt(event) {
    for (const name of ['--look-x', '--look-y']) event.currentTarget.style.setProperty(name, '0px');
    for (const name of ['--tilt-x', '--tilt-y']) event.currentTarget.style.setProperty(name, '0deg');
  }

  return (
    <section
      className="prism-scene thought-scene"
      data-color={thought.color}
      aria-label="Explore the PRism perspective"
      onPointerMove={tilt}
      onPointerLeave={resetTilt}
    >
      <div className="scene-grid" aria-hidden="true" />
      <div className="scene-meta">
        <span>FIG. 01 / PIP THINKS IN CODE</span>
        <span>FOLLOW A THOUGHT. CHANGE YOUR PERSPECTIVE. ↗</span>
      </div>
      <div className="thought-stage">
        <div className="scene-art" aria-hidden="true">
          <div className="orbit orbit-one" />
          <div className="orbit orbit-two" />
          <span className="scene-bracket bracket-left">{'{'}</span>
          <PipMascot greeting={greeting} />
          <span className="scene-bracket bracket-right">{'}'}</span>
        </div>
        <div className="thought-options" aria-label="Pip thought experiments">
          {thoughts.map((item, index) => (
            <button
              type="button"
              className={`thought-option thought-option-${index}`}
              data-color={item.color}
              aria-pressed={selected === index}
              aria-controls="pip-thought"
              key={item.label}
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
        <div
          className="thought-bubble"
          data-color={thought.color}
          id="pip-thought"
          aria-live="polite"
          aria-atomic="true"
        >
          <div className="thought-content" key={selected}>
            <span className="landing-eyebrow">{thought.badge}</span>
            <h3>{thought.title}</h3>
            <p>{thought.text}</p>
            <code>{thought.code}</code>
            <small>Illustrative thought · No model request</small>
          </div>
          <i aria-hidden="true" />
          <b aria-hidden="true" />
        </div>
      </div>
      <div className="mascot-controls">
        <button type="button" aria-label="Say hello to Pip" onClick={greet}>
          Say hello to Pip ↗
        </button>
        <span role="status">
          {greeting
            ? 'Hello, human! Your next PR is the real star.'
            : 'Hover a thought, follow the cubes, or tap to explore.'}
        </span>
      </div>
    </section>
  );
}
