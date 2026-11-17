const integrations = [
  {
    name: 'Semantic retrieval',
    color: 'blue',
    status: 'OPTIONAL · NOT HOSTED',
    text: 'Select relevant source chunks with embeddings and persistent Chroma. The hosted demo uses bounded source context; semantic retrieval is not enabled on this hosted demo.',
  },
  {
    name: 'GitHub delivery & controls',
    color: 'coral',
    status: 'OPT-IN CONFIGURATION',
    text: 'Publish summaries, selected inline findings and advisory status when enabled. Bot controls and repository review policies require their own configuration and permissions.',
  },
  {
    name: 'Review-ready email',
    color: 'yellow',
    status: 'SMTP + USER OPT-IN',
    text: 'Send a saved-report link to a verified GitHub email. SMTP must be configured, and the reviewer must explicitly enable notifications.',
  },
  {
    name: 'Operational tracing',
    color: 'green',
    status: 'OPTIONAL EXTERNAL SERVICE',
    text: 'Export stage timings and model usage through the metadata-only Langfuse integration. Local report diagnostics work without enabling external tracing.',
  },
];

export default function OptionalIntegrations() {
  return (
    <section
      id="optional-integrations"
      className="optional-integrations-visible"
      aria-labelledby="optional-title"
    >
      <div className="optional-heading">
        <div>
          <p className="landing-eyebrow">EXTEND THE WORKFLOW / CONFIGURATION REQUIRED</p>
          <h3 id="optional-title">Optional integrations</h3>
        </div>
        <p>
          Visible options. Honest availability.
          <br />
          These are separate from the core hosted review.
        </p>
      </div>
      <div className="optional-grid">
        {integrations.map((item) => (
          <article data-color={item.color} key={item.name}>
            <span>{item.status}</span>
            <h4>{item.name}</h4>
            <p>{item.text}</p>
          </article>
        ))}
      </div>
    </section>
  );
}
