import { useState } from 'react';
import { workflows } from './deliveryWorkflows.js';
import DeliveryStageExplorer from './DeliveryStageExplorer.jsx';
import './styles/delivery-pipeline.css';

export default function DeliveryPipeline() {
  const [provider, setProvider] = useState('gitlab');
  const [selectedStage, setSelectedStage] = useState(0);
  const workflow = workflows[provider];
  return (
    <section
      id="delivery-pipeline"
      className="section-block engineering-section"
      aria-labelledby="delivery-heading"
    >
      <div className="editorial-heading">
        <div>
          <p className="landing-eyebrow">06 / HOW CHANGES GET CHECKED</p>
          <h2 id="delivery-heading">
            Build with care.
            <br />
            <span className="serif-word">Ship with evidence.</span>
          </h2>
        </div>
        <p>
          The application reviews PRs.
          <br />
          Its own source has verification workflows, too.
        </p>
      </div>
      <div className="delivery-switch" aria-label="CI workflow provider">
        {Object.entries(workflows).map(([key, item]) => (
          <button
            type="button"
            key={key}
            aria-pressed={provider === key}
            aria-controls="delivery-detail"
            data-color={key === 'gitlab' ? 'orange' : 'blue'}
            onClick={() => {
              setProvider(key);
              setSelectedStage(0);
            }}
          >
            {item.label}
            <span>↗</span>
          </button>
        ))}
      </div>
      <div id="delivery-detail" className="delivery-detail">
        <div className="delivery-file">
          <code>{workflow.path}</code>
          <span>CONFIGURED WORKFLOW</span>
        </div>
        <p>{workflow.note}</p>
        <DeliveryStageExplorer
          provider={provider}
          stages={workflow.stages}
          selected={selectedStage}
          onSelect={setSelectedStage}
        />
      </div>
      <div className="delivery-truth">
        <strong>Two workflows. Clear boundaries.</strong>
        <p>
          Manual deployment gate: the Azure release path belongs to GitHub Actions and must be
          explicitly requested.
        </p>
        <p>
          GitLab does not automatically sync from GitHub in this setup. Its test/build file does not
          deploy to Azure. The GitHub Actions deployment path is manually gated and requires
          configured credentials; this diagram is not evidence of a successful hosted run.
        </p>
      </div>
    </section>
  );
}
