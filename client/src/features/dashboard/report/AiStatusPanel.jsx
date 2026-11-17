import { Sparkles } from 'lucide-react';
import { getAiStatusDetails } from './report.helpers.js';

export default function AiStatusPanel({ analysis, files }) {
  const aiReview = getAiStatusDetails(analysis);
  const diagnostics = analysis.aiDiagnostics;
  return (
    <section className={`ai-status-panel ${aiReview.tone}`} aria-label="AI analysis status">
      <Sparkles size={19} />
      <div>
        <strong>{aiReview.label}</strong>
        <p>{aiReview.message}</p>
        {(analysis.aiProvider || analysis.aiModel) && (
          <p>
            Provider:{' '}
            {{ gemini: 'Google Gemini', mistral: 'Mistral', xai: 'xAI / Grok', groq: 'Groq' }[
              analysis.aiProvider
            ] || 'not recorded'}{' '}
            · Model: {analysis.aiModel || 'not recorded'}
          </p>
        )}
        {analysis.aiCoverage && (
          <p>
            AI input: {analysis.aiCoverage.analyzedFiles ?? 0} of{' '}
            {analysis.aiCoverage.totalFiles ?? files.length} fetched files included;{' '}
            {analysis.aiCoverage.skippedFiles?.length || 0} skipped;{' '}
            {analysis.aiCoverage.truncatedFiles?.length || 0} limited patches. Prepared input does not confirm
            a successful AI review.
          </p>
        )}
        {analysis.aiCoverage && (
          <p>
            {analysis.aiCoverage.contextSnippets || 0} source windows included;{' '}
            {analysis.aiCoverage.contextOmissions?.length || 0} context omissions. Direct-import retrieval is
            limited and does not trace every caller.
          </p>
        )}
        {analysis.aiCoverage?.semanticRetrieval && (
          <p>
            Chroma retrieval: {analysis.aiCoverage.semanticRetrieval.status}.{' '}
            {analysis.aiCoverage.semanticRetrieval.status === 'completed'
              ? `${analysis.aiCoverage.semanticRetrieval.retrievedChunks} of ${analysis.aiCoverage.semanticRetrieval.indexedChunks} chunks selected; ${analysis.aiCoverage.semanticRetrieval.cacheHit ? 'cached vectors' : 'new vectors indexed'}; ${analysis.aiCoverage.semanticRetrieval.embeddingCalls} embedding call(s).`
              : 'Bounded source context remains the fallback.'}
          </p>
        )}
        {analysis.aiStatus === 'partial' && analysis.aiError === 'INVALID_REVIEW' && (
          <p>
            The AI explanation was rejected because its structure or code references could not be validated.
          </p>
        )}
        {diagnostics && (
          <details className="ai-diagnostics">
            <summary>Request details</summary>
            <p>
              Prompt {diagnostics.promptVersion || 'not recorded'} · Schema{' '}
              {diagnostics.schemaVersion || 'not recorded'}
              <br />
              Input tokens: {diagnostics.usage?.inputTokens ?? 'unknown'} · Output:{' '}
              {diagnostics.usage?.outputTokens ?? 'unknown'} · Thinking:{' '}
              {diagnostics.usage?.thinkingTokens ?? 'unknown'}
              <br />
              {Number.isSafeInteger(diagnostics.inputCharacters) &&
                Number.isSafeInteger(diagnostics.inputBytes) && (
                  <>
                    Context: {diagnostics.inputCharacters} characters · {diagnostics.inputBytes} UTF-8 bytes
                    (excluding instructions/schema)
                    <br />
                  </>
                )}
              {diagnostics.runId && (
                <>
                  Run: <code>{diagnostics.runId}</code>
                  <br />
                </>
              )}
              {diagnostics.workflow?.engine === 'langgraph' && (
                <>
                  Workflow: LangGraph · checkpointed model/save boundary
                  <br />
                </>
              )}
              {Number.isFinite(diagnostics.durationMs) &&
                `${(diagnostics.durationMs / 1000).toFixed(1)}s elapsed. `}
              {Number.isFinite(diagnostics.timeoutMs) && `${diagnostics.timeoutMs / 1000}s timeout. `}
              {Number.isInteger(diagnostics.httpStatus) && `Provider HTTP ${diagnostics.httpStatus}. `}
              {Number.isInteger(diagnostics.attempts) && `${diagnostics.attempts} attempt(s).`}
              {diagnostics.retryReason && ` Retry reason: ${diagnostics.retryReason}.`}
            </p>
          </details>
        )}
        {analysis.emailNotification && (
          <p>
            Email notification:{' '}
            {{
              sent: 'sent',
              sending: 'delivery outcome pending',
              skipped: 'not sent (disabled, no opt-in or authorization unavailable)',
              unavailable: 'delivery unavailable; report remains saved',
            }[analysis.emailNotification.status] || 'unknown'}
            .
          </p>
        )}
        {diagnostics?.pipeline?.stages?.length > 0 && (
          <details className="ai-diagnostics">
            <summary>Review stages</summary>
            <ul>
              {diagnostics.pipeline.stages.map((stage, index) => (
                <li key={index}>
                  {{
                    github: 'GitHub data',
                    retrieval: 'Context retrieval',
                    memory: 'Revision memory',
                    model: 'AI request',
                  }[stage.name] || 'Review step'}
                  : {(stage.durationMs / 1000).toFixed(2)}s · {stage.status}
                </li>
              ))}
            </ul>
            <p>External trace: {diagnostics.tracing?.status || 'not recorded'}</p>
          </details>
        )}
        {analysis.aiCoverage?.contextSources?.length > 0 && (
          <details className="ai-diagnostics">
            <summary>Retrieved sources</summary>
            <ul>
              {analysis.aiCoverage.contextSources.map((source, index) => (
                <li key={index}>
                  <code>
                    {source.filePath}:{source.startLine}–{source.endLine}
                  </code>{' '}
                  · {source.role} · {source.revision?.slice(0, 8) || 'revision unavailable'}
                </li>
              ))}
            </ul>
          </details>
        )}
        {analysis.aiCoverage?.memorySource && (
          <p>
            Historical hints: {analysis.aiCoverage.memorySource.acceptedFindings} useful label(s) from{' '}
            <a href={`/analyses/${encodeURIComponent(analysis.aiCoverage.memorySource.analysisId)}`}>
              the previous revision
            </a>
            . Findings still require current code evidence.
          </p>
        )}
      </div>
    </section>
  );
}
