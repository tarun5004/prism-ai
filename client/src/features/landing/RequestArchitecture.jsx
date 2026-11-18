import { useEffect, useState } from 'react';
import { requestJourney } from './requestJourney.js';
import './styles/request-architecture.css';

export default function RequestArchitecture() {
  const [selected, setSelected] = useState(0);
  const [playing, setPlaying] = useState(false);
  const [scenario, setScenario] = useState('success');
  const last = requestJourney.length - 1;
  const step = requestJourney[selected];
  const unavailable = scenario === 'unavailable';
  const columns = Math.ceil(requestJourney.length / 2);
  const column = selected < columns ? selected : 2 * columns - 1 - selected;
  const inferenceIndex = requestJourney.findIndex((checkpoint) => checkpoint.id === 'inference');
  const inferenceUnavailable = unavailable && inferenceIndex >= 0 && selected >= inferenceIndex;
  const routeEnd = 100 + (2 * columns - requestJourney.length) * 600 / (columns - 1);
  const route = `M100 90H700Q758 90 758 160V230Q758 290 700 290H${routeEnd}`;

  useEffect(() => {
    if (!playing) return;
    const timer = setTimeout(() => {
      if (selected === last) setPlaying(false);
      else setSelected((index) => index + 1);
    }, 550);
    return () => clearTimeout(timer);
  }, [selected, playing, last]);

  function choose(index) {
    setPlaying(false);
    setSelected(index);
  }
  function replay() {
    setSelected(0);
    setPlaying(true);
  }

  return (
    <div className="request-architecture" data-color={step.color}>
      <div className="request-toolbar">
        <div>
          <span className="engineering-badge">ILLUSTRATIVE REQUEST</span>
          <p>
            Illustrative request · not live telemetry. Hover a platform, tap a checkpoint, or replay the
            journey.
          </p>
        </div>
        <button type="button" onClick={replay}>
          {playing ? 'Restart request ↻' : 'Replay request ↗'}
        </button>
      </div>
      <div className="request-scene">
        <div className="request-floor" aria-hidden="true" />
        <svg className="request-route" viewBox="0 0 800 380" preserveAspectRatio="none" aria-hidden="true">
          <path d={route} />
          <path
            pathLength="1"
            className="route-trace"
            d={route}
            style={{ '--route-progress': selected / last }}
          />
          <circle className="request-packet" cx={100 + column * 600 / (columns - 1)} cy={selected < columns ? 90 : 290} r="7" />
        </svg>
        <ol className="request-checkpoints" aria-label="Request checkpoints" style={{ '--request-columns': columns }}>
          {requestJourney.map(({ label, icon: Icon, color, service }, index) => (
            <li key={label} data-index={index} style={{
              '--checkpoint-column': index < columns ? index + 1 : 2 * columns - index,
              '--checkpoint-row': index < columns ? 1 : 2,
            }}>
              <button
                type="button"
                className="request-platform"
                data-color={color}
                data-reached={index <= selected}
                aria-pressed={index === selected}
                aria-controls="request-checkpoint-detail"
                onPointerEnter={(event) => {
                  if (event.pointerType === 'mouse') choose(index);
                }}
                onFocus={() => choose(index)}
                onClick={() => choose(index)}
              >
                <span className="platform-top">
                  <span>0{index + 1}</span>
                  <Icon size={26} strokeWidth={1.5} />
                  <i aria-hidden="true" />
                </span>
                <strong>{label}</strong>
                <small>{service}</small>
              </button>
            </li>
          ))}
        </ol>
      </div>
      <div className="request-scrubber">
        <button
          type="button"
          disabled={selected === 0}
          onClick={() => choose(selected - 1)}
          aria-label="Previous request checkpoint"
        >
          ←
        </button>
        <label htmlFor="request-progress">CHECKPOINT {String(selected + 1).padStart(2, '0')} / {String(requestJourney.length).padStart(2, '0')}</label>
        <input
          id="request-progress"
          type="range"
          min="0"
          max={last}
          value={selected}
          aria-label="Follow the request"
          aria-valuetext={step.label}
          onChange={(event) => choose(Number(event.target.value))}
        />
        <button
          type="button"
          disabled={selected === last}
          onClick={() => choose(selected + 1)}
          aria-label="Next request checkpoint"
        >
          →
        </button>
      </div>
      <div
        id="request-checkpoint-detail"
        className="request-checkpoint-detail"
        aria-live="polite"
        aria-atomic="true"
      >
        <div className="step-enter" key={`${selected}-${scenario}`}>
          <span className="landing-eyebrow">
            CHECKPOINT 0{selected + 1} / {step.checkpoint}
          </span>
          <h3>{step.title}</h3>
          <p>{step.detail}</p>
          {inferenceUnavailable && (
            <p className="request-fallback">
              Provider-unavailable example: the report records AI as unavailable. Available rule-based results
              and the saved diff remain inspectable; this is not a successful AI review.
            </p>
          )}
        </div>
        <div className="request-payload">
          <span>WHAT MOVES HERE</span>
          <code>{step.payload}</code>
          <span>OUTCOME</span>
          <p>
            {inferenceUnavailable
              ? 'AI unavailable · available rules and code preserved'
              : step.output}
          </p>
        </div>
      </div>
      <div className="request-scenario">
        <label htmlFor="request-scenario">Explore an outcome</label>
        <select
          id="request-scenario"
          value={scenario}
          onChange={(event) => {
            setScenario(event.target.value);
            setPlaying(false);
          }}
        >
          <option value="success">Successful review example</option>
          <option value="unavailable">Provider unavailable example</option>
        </select>
        <span>Educational simulation · No API or AI calls</span>
      </div>
    </div>
  );
}
