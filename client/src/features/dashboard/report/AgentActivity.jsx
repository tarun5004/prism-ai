const toolLabels = { inspect_pr_snapshot: 'Inspect PR snapshot', read_source_window: 'Read source window',
  find_related_tests: 'Find related tests', search_review_context: 'Search review context', run_review_rules: 'Inspect rule signals' };
const readable = value => typeof value === 'string' ? value.replaceAll('_', ' ').slice(0, 100) : 'not recorded';
const metric = value => Number.isFinite(value) && value >= 0 ? value : 'unknown';

export default function AgentActivity({ agent, files = [], onNavigate }) {
  if (!agent || typeof agent !== 'object') return null;
  const events = Array.isArray(agent.events) ? agent.events.slice(0, 4).filter(event => event && typeof event === 'object') : [];
  const provenance = { 'live-provider': 'Live provider', 'scripted-fixture': 'Scripted fixture', 'injected-provider': 'Injected provider', 'not-started': 'Agent not started' }[agent.provenance] || 'Provenance unknown';
  return (
    <details className="agent-activity">
      <summary>Agent activity <span className="agent-provenance">{provenance}</span></summary>
      <p>Bounded LangGraph investigation · {readable(agent.stopReason)}</p>
      <dl className="agent-metrics">
        <div><dt>Rounds</dt><dd>{metric(agent.rounds)} / 2</dd></div>
        <div><dt>Tools</dt><dd>{metric(agent.toolCalls)} / 4</dd></div>
        <div><dt>Model attempts</dt><dd>{metric(agent.attempts)} / 3</dd></div>
        <div><dt>Total tokens</dt><dd>{metric(agent.usage?.totalTokens)}</dd></div>
      </dl>
      <p>Estimated model cost: {Number.isFinite(agent.cost?.estimatedUsd) ? `$${agent.cost.estimatedUsd.toFixed(6)} USD (${agent.cost.asOf || 'rate date unknown'})` : 'unknown (complete usage and dated prices required)'}. Infrastructure is excluded.</p>
      <ol className="agent-events">
        {events.map((event, index) => (
          <li key={index}>
            <strong>{toolLabels[event.tool] || 'Unknown tool'}</strong>
            <span>{readable(event.status)} · {metric(event.durationMs)} ms</span>
            {Array.isArray(event.sources) && event.sources.slice(0, 16).filter(source => typeof source?.filePath === 'string').map((source, sourceIndex) => {
              const label = `${source.filePath} · ${source.lineSide === 'old' ? 'old' : 'new'} ${metric(source.startLine)}–${metric(source.endLine)}`;
              const inDiff = files.some(file => file.path === source.filePath);
              return inDiff && onNavigate
                ? <button className="evidence-link" key={sourceIndex} type="button" onClick={() => onNavigate({ filePath: source.filePath, lineSide: source.lineSide, lineNumber: source.startLine })}>{label}</button>
                : <code key={sourceIndex}>{label}</code>;
            })}
          </li>
        ))}
      </ol>
      {!events.length && <p>No tool execution was recorded.</p>}
      <p className="muted-text">Tools read only the authorized snapshot. Tests were not executed. Evidence matching does not prove a finding is correct.</p>
    </details>
  );
}
