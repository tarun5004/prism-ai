import { useState } from 'react';
import './styles/agent-workflow.css';

const tools = [
  {
    name: 'Inspect PR snapshot', color: 'coral', id: 'inspect_pr_snapshot',
    question: 'What changed, and what was intended?',
    detail: 'Read the supplied PR intent and changed-file list. The model starts with an exact revision and visible coverage, rather than guessing what the repository contains.',
    boundary: 'Only the authorized snapshot; no new GitHub request.',
  },
  {
    name: 'Read source window', color: 'green', id: 'read_source_window',
    question: 'What surrounds this particular line?',
    detail: 'Select a known source ID and an approved line range. Numbered code keeps the path, revision and evidence coordinates attached.',
    boundary: 'Up to 60 lines within an already-supplied source; no arbitrary file access.',
  },
  {
    name: 'Find related tests', color: 'yellow', id: 'find_related_tests',
    question: 'Do nearby tests explain the contract?',
    detail: 'Inspect supplied test windows explicitly related to a changed file. A missing nearby test is a context limitation, not proof that the repository has no tests.',
    boundary: 'Reads test code only. Tests and repository commands are never executed.',
  },
  {
    name: 'Search review context', color: 'blue', id: 'search_review_context',
    question: 'Which approved snippet is relevant?',
    detail: 'Rank the supplied source windows using keywords in paths and code. Select up to four matches while retaining their source identity.',
    boundary: 'Bounded lexical retrieval; no embeddings, vector search or whole-repository search.',
  },
  {
    name: 'Run review rules', color: 'orange', id: 'run_review_rules',
    question: 'Which deterministic signals need investigation?',
    detail: 'Inspect the heuristic findings already supplied by Node, optionally for one changed file. A signal gives the model a lead to investigate; it does not establish a bug.',
    boundary: 'Reads existing rule results; it does not execute repository code.',
  },
];

export default function AgentWorkflow() {
  const [selected, setSelected] = useState(0);
  const tool = tools[selected];
  return (
    <section id="agent-workflow" className="section-block agent-section" aria-labelledby="agent-heading">
      <div className="editorial-heading">
        <div>
          <p className="landing-eyebrow">INSIDE THE REVIEW / FIVE READ-ONLY TOOLS</p>
          <h2 id="agent-heading">Choose evidence.<br /><span className="serif-word">Then reason about the change.</span></h2>
        </div>
        <p>Python FastAPI receives an authorized snapshot. A per-request LangGraph loop lets the model choose useful evidence within explicit limits.</p>
      </div>
      <div className="agent-limits" aria-label="Agent review limits">
        <span><strong>3</strong> provider requests</span>
        <span><strong>2</strong> decision rounds</span>
        <span><strong>4</strong> tool calls total</span>
        <span><strong>90s</strong> overall / 30s per attempt</span>
      </div>
      <div className="pipeline-explorer agent-explorer">
        <ol aria-label="Agent snapshot tools">
          {tools.map((item, index) => (
            <li key={item.id}>
              <button type="button" data-color={item.color} aria-pressed={selected === index}
                aria-controls="agent-tool-detail" onClick={() => setSelected(index)} onFocus={() => setSelected(index)}
                onPointerEnter={(event) => { if (event.pointerType === 'mouse') setSelected(index); }}>
                <span>0{index + 1}</span><strong>{item.name}</strong><span aria-hidden="true">↗</span>
              </button>
            </li>
          ))}
        </ol>
        <div id="agent-tool-detail" className="pipeline-detail" data-color={tool.color} aria-live="polite" aria-atomic="true">
          <div className="step-enter" key={tool.id}>
            <span className="landing-eyebrow">ILLUSTRATIVE EXPLORER / NO LIVE REQUEST</span>
            <h3>{tool.question}</h3>
            <p>{tool.detail}</p>
            <div className="pipeline-code"><span>ALLOWLISTED TOOL / SNAPSHOT INPUT ONLY</span><code>{tool.id}</code></div>
            <p className="pipeline-outcome">↳ {tool.boundary}</p>
          </div>
        </div>
      </div>
      <ol className="agent-review-flow" aria-label="Agent review and approval flow">
        <li data-color="lilac"><strong>Decide & inspect</strong><span>Gemini 3 planner: low thinking. Choose an allowed tool or finish; each call shares the same budget.</span></li>
        <li data-color="blue"><strong>Draft & validate</strong><span>Reviewer defaults to medium thinking. Python and Node check schema, changed lines and exact evidence. Citations do not prove correctness.</span></li>
        <li data-color="green"><strong>Save & inspect</strong><span>Node owns durable jobs, checkpoints and Mongo report storage. Python has no durable mid-loop resume; uncertain model calls are not blindly replayed.</span></li>
        <li data-color="coral"><strong>Human approval</strong><span>Inspect the saved review. An explicit approval can publish one fixed GitHub summary after fresh permission and revision checks.</span></li>
      </ol>
      <p className="pipeline-stack-note">Illustrative interaction · no API or AI calls. The agent reads bounded context; it cannot run code, edit files or merge a PR. Findings remain advisory, and incomplete or unavailable reviews stay visible.</p>
    </section>
  );
}
