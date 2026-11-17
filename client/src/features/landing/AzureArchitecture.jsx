import { Cloud } from 'lucide-react';
import RequestArchitecture from './RequestArchitecture.jsx';

export default function AzureArchitecture() {
  return (
    <section id="architecture" className="section-block cloud-section" aria-labelledby="cloud-heading">
      <div className="editorial-heading">
        <div>
          <p className="landing-eyebrow">05 / UNDER THE HOOD</p>
          <h2 id="cloud-heading">
            Small footprint.
            <br />
            <span className="serif-word">Real cloud architecture.</span>
          </h2>
        </div>
        <div className="azure-stamp">
          <Cloud size={24} />
          <span>
            DEPLOYED ON
            <br />
            <strong>Microsoft Azure</strong>
          </span>
        </div>
      </div>
      <p className="section-lede">
        Docker-packaged services. Durable background reviews. Compute that can scale to zero.
      </p>
      <RequestArchitecture />
      <div className="cloud-facts">
        <div>
          <h3>External services</h3>
          <p>
            Google Gemini supplies inference. MongoDB Atlas stores jobs and reports. These are external to
            Azure Container Apps.
          </p>
        </div>
        <div>
          <h3>Designed for a personal demo</h3>
          <p>
            Minimum API replicas: 0. A 15-minute idle cooldown target; event workers start for queued work.
            Scale-to-zero is not a billing cap—storage and other usage can still cost.
          </p>
        </div>
      </div>
      <details className="cold-start-note">
        <summary>
          First visit or review taking a little longer? <span>+</span>
        </summary>
        <p>
          This serverless demo may need time to wake up. If a cold webhook misses GitHub’s delivery deadline,
          open the workspace and use Analyze PR, or redeliver the failed event from GitHub App settings.
        </p>
        <p>
          GitHub does not automatically retry failed webhook deliveries. Reopening an old failed report does
          not create a fresh AI review.
        </p>
      </details>
    </section>
  );
}
