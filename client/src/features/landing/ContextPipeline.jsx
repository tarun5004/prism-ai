import { useState } from 'react';
import './styles/engineering.css';
import PipelineIllustration from './PipelineIllustration.jsx';

const stages = [
  {
    name: 'Pin the revision',
    color: 'coral',
    title: 'Review the code that actually changed.',
    text: 'GitHub metadata, paginated patches and base/head revisions identify the review. A revision check prevents a moving PR from being presented as one consistent snapshot.',
    example: [
      'PR #42 / base → head',
      'changed file → numbered old/new lines',
      'revision changed? stop and request a fresh review',
    ],
    result: 'An exact revision, not a moving target.',
  },
  {
    name: 'Build bounded context',
    color: 'green',
    title: 'Retrieve the nearby code. Keep its coordinates.',
    text: 'Node collects source windows, selected direct imports and bounded nearby tests. The Python agent can search those supplied windows with lexical ranking. Paths, line ranges and revisions travel with the context; unavailable sources are recorded as omissions.',
    example: [
      'review-policy.js:1–32 / head revision',
      'direct import → selected related source',
      'related tests + lexical matches → approved context',
    ],
    result: 'Context engineering: useful source with visible limits.',
  },
  {
    name: 'Prepare safe input',
    color: 'yellow',
    title: 'A deliberate input budget, not a repository dump.',
    text: 'Sensitive paths and credential-like content are excluded by pattern checks. Binary, unsupported and missing patches are skipped. Diff input is limited to five files and 12,000 serialized characters; separate limits also bound source snippets and historical hints.',
    example: [
      'intent + numbered diff + source windows',
      'sensitive / binary / oversized → omit or limit',
      'coverage → included files + skipped paths + omissions',
    ],
    result: 'Prepared input does not prove that AI completed.',
  },
  {
    name: 'Generate & validate',
    color: 'blue',
    title: 'Evidence validation before a finding becomes a report.',
    text: 'A private FastAPI service runs a per-request LangGraph tool loop through a LangChain Gemini adapter. Python and Node validate the schema, file, side, line and exact evidence. Node owns the durable model/save checkpoint; an uncertain model outcome is not blindly replayed after a crash.',
    example: [
      'model response → schema validation',
      'finding → actual added/deleted diff line',
      'file + side + line + exact evidence → validate',
    ],
    result: 'An evidence match supports traceability; it does not prove the reasoning is correct.',
  },
  {
    name: 'Save & learn',
    color: 'orange',
    title: 'Keep the review, the evidence and your judgment.',
    text: 'The report saves the diff, revision, coverage, diagnostics and validated findings. Useful/incorrect feedback is stored separately. Up to three useful-labelled findings from a prior revision can act as historical hints; they must still be checked against current code.',
    example: [
      'saved revision → report + AI status',
      'reviewer verdict → useful / incorrect',
      'historical hint ≠ current code evidence',
    ],
    result: 'Saved reports remain useful when a provider is unavailable.',
  },
];

export default function ContextPipeline() {
  const [selected, setSelected] = useState(1);
  const stage = stages[selected];
  return (
    <section
      id="context-pipeline"
      className="section-block engineering-section"
      aria-labelledby="context-heading"
    >
      <div className="editorial-heading">
        <div>
          <p className="landing-eyebrow">02 / CONTEXT ENGINEERING</p>
          <h2 id="context-heading">
            The diff is the start.
            <br />
            <span className="serif-word">Here’s what happens next.</span>
          </h2>
        </div>
        <p>
          Not “send code to a chatbot.”
          <br />A bounded retrieval, generation and validation pipeline.
        </p>
      </div>
      <PipelineIllustration selected={selected} onSelect={setSelected} />
      <div className="pipeline-explorer">
        <ol aria-label="Context engineering stages">
          {stages.map((item, index) => (
            <li key={item.name}>
              <button
                type="button"
                data-color={item.color}
                aria-pressed={selected === index}
                aria-controls="context-stage-detail"
                onClick={() => setSelected(index)}
                onFocus={() => setSelected(index)}
                onPointerEnter={(event) => {
                  if (event.pointerType === 'mouse') setSelected(index);
                }}
              >
                <span>0{index + 1}</span>
                <strong>{item.name}</strong>
                <span aria-hidden="true">↗</span>
              </button>
            </li>
          ))}
        </ol>
        <div
          id="context-stage-detail"
          className="pipeline-detail"
          data-color={stage.color}
          aria-live="polite"
          aria-atomic="true"
        >
          <div className="step-enter" key={selected}>
            <span className="landing-eyebrow">CONTEXT ENGINEERING / 0{selected + 1}</span>
            <h3>{stage.title}</h3>
            <p>{stage.text}</p>
            <div className="pipeline-code" aria-label="Illustrative data flow">
              <span>ILLUSTRATIVE FLOW / NO LIVE REQUEST</span>
              {stage.example.map((line, index) => (
                <code key={line}>
                  <i>{index + 1}</i>
                  {line}
                </code>
              ))}
            </div>
            <p className="pipeline-outcome">↳ {stage.result}</p>
          </div>
        </div>
      </div>
      <p className="pipeline-stack-note">
        <strong>LangChain</strong> connects Gemini. <strong>LangGraph</strong> coordinates the Python agent’s
        per-request decisions and tools. <strong>Node</strong> owns durable job recovery and saving;
        <strong>Evidence validation</strong> independently checks references at the report boundary.
      </p>
      <div className="semantic-branch">
        <div>
          <span className="engineering-badge">OPTIONAL LEGACY BRANCH / SEPARATE FROM THE PYTHON AGENT</span>
          <h3>Where semantic RAG fits</h3>
          <p>
            The Python agent uses bounded snapshot context and lexical retrieval, with no embeddings or
            vector database. The optional legacy semantic path selects from already-collected context;
            it does not clone or search the whole repository.
          </p>
        </div>
        <ol>
          <li>
            <strong>Chunk & embed</strong>
            <span>
              Up to 16 chunks; 32-line windows with a 4-line overlap. Explicit Gemini embeddings avoid an
              implicit model download.
            </span>
          </li>
          <li>
            <strong>Index & retrieve</strong>
            <span>
              Persistent Chroma stores vectors scoped to the installation, repository and revisions. Content
              hashes support reuse; the query selects up to 4 results from current trusted chunks.
            </span>
          </li>
          <li>
            <strong>Generate with provenance</strong>
            <span>
              Selected source retains file, side, line and revision metadata. If semantic retrieval fails,
              bounded source context remains the fallback and the omission is recorded.
            </span>
          </li>
        </ol>
      </div>
    </section>
  );
}
