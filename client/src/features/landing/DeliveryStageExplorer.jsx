import {
  GitBranch,
  TestTube2,
  Package,
  ScanLine,
  Container,
  ShieldCheck,
  CloudUpload,
} from 'lucide-react';

const stageIcons = {
  gitlab: [GitBranch, TestTube2, Package, ScanLine],
  github: [TestTube2, Container, ShieldCheck, CloudUpload],
};
const stageColors = {
  gitlab: ['coral', 'yellow', 'blue', 'green'],
  github: ['yellow', 'blue', 'orange', 'green'],
};

export default function DeliveryStageExplorer({ provider, stages, selected, onSelect }) {
  const stage = stages[selected];
  return (
    <div className="delivery-explorer" data-color={stageColors[provider][selected]}>
      <p className="delivery-simulation">
        Illustrative workflow · does not run CI. Choose a stage to inspect it.
      </p>
      <ol className="delivery-stages" aria-label="Explore workflow stages">
        {stages.map((item, index) => {
          const Icon = stageIcons[provider][index];
          return (
            <li key={item.name} data-color={stageColors[provider][index]}>
              <button
                type="button"
                aria-pressed={selected === index}
                aria-controls="delivery-stage-detail"
                onPointerEnter={(event) => {
                  if (event.pointerType === 'mouse') onSelect(index);
                }}
                onFocus={() => onSelect(index)}
                onClick={() => onSelect(index)}
              >
                <span className="delivery-node">
                  <Icon size={27} strokeWidth={1.6} />
                  <small>0{index + 1}</small>
                </span>
                <strong>{item.name}</strong>
                <span className="delivery-stage-action">
                  Inspect stage <span aria-hidden="true">↗</span>
                </span>
              </button>
            </li>
          );
        })}
      </ol>
      <div
        id="delivery-stage-detail"
        className="delivery-stage-detail"
        aria-live="polite"
        aria-atomic="true"
      >
        <div className="step-enter" key={`${provider}-${selected}`}>
          <span className="landing-eyebrow">STAGE 0{selected + 1} / 04</span>
          <h3>{stage.name}</h3>
          <p>{stage.text}</p>
        </div>
        <dl className="delivery-artifacts">
          <div>
            <dt>WHAT THIS STAGE PRODUCES</dt>
            <dd>{stage.artifact}</dd>
          </div>
          <div>
            <dt>WHAT CAN STOP IT</dt>
            <dd>{stage.gate}</dd>
          </div>
        </dl>
      </div>
    </div>
  );
}
