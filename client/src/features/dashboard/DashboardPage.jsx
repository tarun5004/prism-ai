import { AlertTriangle, ArrowUpRight, CheckCircle2, ClipboardCheck, FileCode2, GitPullRequest, LoaderCircle, ShieldAlert, Sparkles } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import DiffViewer, { findDiffLocation } from './DiffViewer.jsx';
import { createAnalysis, loadAnalysis, loadRecentAnalyses, saveFindingFeedback, loadDemoAnalysis } from './analysis.api.js';

function getAiStatusDetails(analysis) {
    if (analysis.status === 'failed') {
        return { tone: 'warning', label: 'AI review not completed', message: 'The PR analysis failed. No successful AI review is confirmed.' };
    }
    if (analysis.aiStatus === 'completed') {
        return { tone: 'success', label: 'AI analysis completed', message: 'The model returned a validated response. Findings remain advisory.' };
    }
    if (analysis.aiStatus === 'partial') {
        return { tone: 'warning', label: 'AI analysis partial', message: analysis.aiError === 'INVALID_FINDINGS' ? 'Some AI findings were rejected. Available validated findings and completed rule-based results are shown.' : 'AI reviewed limited diff context. Available validated findings and completed rule-based results are shown.' };
    }

    const rulesMessage = analysis.status === 'completed' ? 'Rule-based analysis completed; its results remain available.' : 'Rule-based completion is not confirmed for this report.';
    if (analysis.aiStatus === 'unavailable' || analysis.aiStatus === 'failed') {
        const errors = {
            TIMEOUT: 'The AI request timed out.',
            API_ERROR: 'The AI provider could not complete the request.',
            PROVIDER_ACCESS_DENIED: 'The AI provider denied access from this deployment. Check provider permissions and supported deployment regions.',
            PROVIDER_REGION_UNAVAILABLE: 'The AI provider does not support this deployment region. Move the worker to a supported region.',
            INVALID_RESPONSE: 'The AI response could not be validated.',
            INVALID_RETRY_LIMIT: 'AI retry configuration must be 0 or 1.',
            INVALID_FINDINGS: 'The AI findings could not be validated.',
            INVALID_REVIEW: 'The AI review explanation could not be validated. Any valid findings are shown separately.',
            INVALID_TIMEOUT: 'AI request configuration needs attention.',
            INVALID_PROVIDER: 'Select a supported AI provider on the server.',
            MISSING_MODEL: 'The selected provider needs a model name.',
            UNSAFE_LOGGING: 'Disable verbose model logging on the server.'
        };
        const reason = analysis.aiError === 'API_ERROR' && analysis.aiDiagnostics?.httpStatus === 403
            ? errors.PROVIDER_ACCESS_DENIED
            : analysis.aiError === 'API_ERROR' && analysis.aiDiagnostics?.httpStatus === 504
            ? 'The AI request exceeded its processing deadline.'
            : typeof analysis.aiError === 'string' && Object.hasOwn(errors, analysis.aiError) ? errors[analysis.aiError] : 'AI analysis could not be completed.';
        return { tone: 'warning', label: 'AI analysis unavailable', message: `${reason} ${rulesMessage}` };
    }
    if (analysis.aiStatus === 'skipped') {
        const reason = analysis.aiError === 'MISSING_API_KEY' ? 'AI is not configured.' : analysis.aiError === 'NO_REVIEWABLE_DIFF' ? 'No reviewable diff was available for AI.' : 'AI analysis was skipped.';
        return { tone: 'neutral', label: 'AI analysis skipped', message: `${reason} ${rulesMessage}` };
    }
    return { tone: 'neutral', label: 'AI status not recorded', message: `This saved report does not confirm a successful AI review. ${rulesMessage}` };
}

function formatDate(value) {
    const date = new Date(value);
    return Number.isNaN(date.getTime()) ? 'Date unavailable' : date.toLocaleString();
}

function getFailureMessage(analysis) {
    const messages = {
        GITHUB_RATE_LIMIT: 'GitHub rate limit reached. Wait before analyzing again or check the server token.',
        GITHUB_AUTH: 'GitHub authentication failed. Check the server token.',
        GITHUB_ACCESS: 'GitHub denied access. Check repository permissions and try again later.',
        GITHUB_NOT_FOUND: 'This PR was not found or is not accessible with the server token.',
        GITHUB_TIMEOUT: 'GitHub retrieval timed out. Try again later.',
        REVISION_CHANGED: 'The PR revision changed during retrieval. Analyze the latest revision again.',
        REPORT_TOO_LARGE: 'This PR exceeds the demo’s 4 MiB report limit. Choose a smaller PR.',
        GITHUB_UNAVAILABLE: 'GitHub could not be reached or returned an unusable response. Try again later.'
    };
    return Object.hasOwn(messages, analysis.errorCode) ? messages[analysis.errorCode] : 'This analysis did not complete. Check backend connectivity and GitHub access before trying again.';
}

function ReviewReference({ reference, files, onNavigate }) {
    const location = findDiffLocation(files, reference);
    return <div className="review-reference">
        {location ? <button type="button" className="text-button" onClick={() => onNavigate({ ...reference })}>View {reference.lineSide || 'new'} line {reference.lineNumber} in diff · {reference.filePath}</button>
            : <span className="muted-text">Source context · {reference.filePath}:{reference.lineNumber} ({reference.lineSide || 'new'})</span>}
        <pre className="finding-evidence"><code>{reference.evidence}</code></pre>
    </div>;
}

function FindingFeedback({ analysisId, findingIndex, annotation }) {
    const [reason, setReason] = useState(annotation?.reason || '');
    const [verdict, setVerdict] = useState(annotation?.verdict || '');
    const [saving, setSaving] = useState(false);
    const [message, setMessage] = useState('');
    const [error, setError] = useState('');
    async function save(nextVerdict) {
        if (saving) return;
        setSaving(true); setMessage(''); setError('');
        try {
            await saveFindingFeedback(analysisId, findingIndex, nextVerdict, reason);
            setVerdict(nextVerdict); setMessage('Feedback saved. Original finding unchanged.');
        } catch (failure) { setError(failure.message); }
        finally { setSaving(false); }
    }
    return <div className="finding-feedback">
        <label>Optional feedback reason<textarea maxLength={500} value={reason} onChange={event => setReason(event.target.value)} rows={2} /></label>
        <div><button type="button" disabled={saving} aria-pressed={verdict === 'useful'} onClick={() => save('useful')}>Useful</button>{' '}<button type="button" disabled={saving} aria-pressed={verdict === 'incorrect'} onClick={() => save('incorrect')}>Incorrect</button></div>
        <span role="status">{saving ? 'Saving feedback…' : message}</span>
        {error && <p role="alert" className="error-message">{error}</p>}
    </div>;
}

function AnalysisReport({ analysis, userId = 'local' }) {
    const [activeView, setActiveView] = useState(analysis.sample ? 'findings' : 'overview');
    const [sourceFilter, setSourceFilter] = useState('all');
    const [severityFilter, setSeverityFilter] = useState('all');
    const [focusLocation, setFocusLocation] = useState(null);
    const findings = analysis.findings || [];
    const files = analysis.pullRequest?.changedFiles || [];
    const pr = analysis.pullRequest || {};
    const aiReview = getAiStatusDetails(analysis);
    const successful = analysis.status === 'completed';
    const statusLabel = successful ? (analysis.aiStatus === 'completed' ? 'Analysis completed' : 'Rule-based analysis completed') : 'Analysis failed';
    const ReportIcon = successful ? CheckCircle2 : AlertTriangle;
    const visibleFindings = findings.filter(finding =>
        (sourceFilter === 'all' || finding.source === sourceFilter)
        && (severityFilter === 'all' || finding.severity === severityFilter));
    const diagnostics = analysis.aiDiagnostics;
    const review = successful && ['completed', 'partial'].includes(analysis.aiStatus) ? analysis.aiReview : null;
    const recommendationLabels = { changes_requested: 'Changes recommended', human_review: 'Human review recommended', insufficient_context: 'More context needed', no_blocker_found: 'No blocker found in reviewed scope' };

    return (
        <div className="analysis-workspace">
            {analysis.sample && <section className="sample-notice"><strong>Recorded sample · read-only</strong><p>{analysis.sample.description}</p></section>}
            <section className="report-section" aria-labelledby="report-title">
                <div className="section-heading">
                    <div>
                        <p className="section-label">Review report</p>
                        <h2 id="report-title">{pr.title || 'Analysis result'}</h2>
                        <p className="muted-text">{pr.repository || 'Repository unavailable'}{pr.author && ` · opened by ${pr.author}`}</p>
                    </div>
                    <span className={`report-status ${analysis.status}`}><ReportIcon size={15} />{statusLabel}</span>
                </div>
                <div className="revision-meta">
                    {analysis.githubFeedback && <span>GitHub summary: {({ posted: 'posted', existing: 'already posted for this revision', unavailable: 'not delivered; saved review remains available', skipped: 'disabled' })[analysis.githubFeedback.status] || 'status unknown'}</span>}
                    {analysis.githubInline && <span>Inline findings: {analysis.githubInline.status}{analysis.githubInline.errorCode && ` (${analysis.githubInline.errorCode})`}</span>}
                    {analysis.githubStatus && <span>GitHub advisory status: {analysis.githubStatus.status}</span>}
                    <span>{formatDate(analysis.createdAt)}</span>
                    {pr.headSha ? <code title={pr.headSha}>{pr.headBranch} @ {pr.headSha.slice(0, 8)}</code> : <span>{analysis.sample ? 'Owned fixture snapshot; no GitHub commit' : 'Revision not recorded in this older report'}</span>}
                    {pr.baseSha && <code title={pr.baseSha}>base {pr.baseBranch} @ {pr.baseSha.slice(0, 8)}</code>}
                    {pr.reviewScope?.mode === 'incremental' && <span>Incremental review since {pr.diffBaseSha?.slice(0, 8)}; earlier unchanged code was not reviewed again.</span>}
                    {pr.reviewScope?.excludedPaths?.length > 0 && <span>{pr.reviewScope.excludedPaths.length} file(s) excluded by repository settings.</span>}
                </div>
                {!successful && <p className="error-message" role="alert">{getFailureMessage(analysis)}</p>}
                {pr.filesComplete === false && <p className="diff-warning">File retrieval is incomplete: {files.length} of {pr.totalChangedFiles ?? 'an unknown number of'} files were saved. This report covers only the available files.</p>}
                <div className="risk-summary">
                    <div><span className="summary-number">{findings.length}</span><span className="summary-label">findings</span></div>
                    <div><span className="summary-number high">{findings.filter(finding => finding.severity === 'high').length}</span><span className="summary-label">high attention</span></div>
                    <div><span className="summary-number">{files.length}</span><span className="summary-label">files saved</span></div>
                    <div><span className="summary-number diff-additions">+{files.reduce((sum, file) => sum + (Number.isFinite(file.additions) ? file.additions : 0), 0)}</span><span className="summary-label diff-deletions">−{files.reduce((sum, file) => sum + (Number.isFinite(file.deletions) ? file.deletions : 0), 0)} lines</span></div>
                </div>
            </section>
            <div className="review-workbench">
                <DiffViewer files={files} focusLocation={focusLocation} />
                <aside className="review-sidebar">
                    <div className="review-panel-heading"><Sparkles size={17} /><strong>Review assistant</strong><span className="history-count">Advisory</span></div>
                    <nav className="review-views" aria-label="Review views">
                        <button type="button" aria-pressed={activeView === 'overview'} aria-controls="review-panel" onClick={() => setActiveView('overview')}>Overview</button>
                        <button type="button" aria-pressed={activeView === 'findings'} aria-controls="review-panel" onClick={() => setActiveView('findings')}>Findings <span>{findings.length}</span></button>
                    </nav>
                    <div className="review-panel" id="review-panel" role="region" aria-label="Review panel">
                        <section className={`ai-status-panel ${aiReview.tone}`} aria-label="AI analysis status">
                            <Sparkles size={19} />
                            <div>
                                <strong>{aiReview.label}</strong><p>{aiReview.message}</p>
                                {(analysis.aiProvider || analysis.aiModel) && <p>Provider: {({ gemini: 'Google Gemini', mistral: 'Mistral', xai: 'xAI / Grok', groq: 'Groq' })[analysis.aiProvider] || 'not recorded'} · Model: {analysis.aiModel || 'not recorded'}</p>}
                                {analysis.aiCoverage && <p>AI input: {analysis.aiCoverage.analyzedFiles ?? 0} of {analysis.aiCoverage.totalFiles ?? files.length} fetched files included; {analysis.aiCoverage.skippedFiles?.length || 0} skipped; {analysis.aiCoverage.truncatedFiles?.length || 0} limited patches. Prepared input does not confirm a successful AI review.</p>}
                                {analysis.aiCoverage && <p>{analysis.aiCoverage.contextSnippets || 0} source windows included; {analysis.aiCoverage.contextOmissions?.length || 0} context omissions. Direct-import retrieval is limited and does not trace every caller.</p>}
                                {analysis.aiCoverage?.semanticRetrieval && <p>Chroma retrieval: {analysis.aiCoverage.semanticRetrieval.status}. {analysis.aiCoverage.semanticRetrieval.status === 'completed' ? `${analysis.aiCoverage.semanticRetrieval.retrievedChunks} of ${analysis.aiCoverage.semanticRetrieval.indexedChunks} chunks selected; ${analysis.aiCoverage.semanticRetrieval.cacheHit ? 'cached vectors' : 'new vectors indexed'}; ${analysis.aiCoverage.semanticRetrieval.embeddingCalls} embedding call(s).` : 'Bounded source context remains the fallback.'}</p>}
                                {analysis.aiStatus === 'partial' && analysis.aiError === 'INVALID_REVIEW' && <p>The AI explanation was rejected because its structure or code references could not be validated.</p>}
                                {diagnostics && <details className="ai-diagnostics"><summary>Request details</summary><p>
                                    Prompt {diagnostics.promptVersion || 'not recorded'} · Schema {diagnostics.schemaVersion || 'not recorded'}<br />
                                    Input tokens: {diagnostics.usage?.inputTokens ?? 'unknown'} · Output: {diagnostics.usage?.outputTokens ?? 'unknown'} · Thinking: {diagnostics.usage?.thinkingTokens ?? 'unknown'}<br />
                                    {Number.isSafeInteger(diagnostics.inputCharacters) && Number.isSafeInteger(diagnostics.inputBytes) && <>Context: {diagnostics.inputCharacters} characters · {diagnostics.inputBytes} UTF-8 bytes (excluding instructions/schema)<br /></>}
                                    {diagnostics.runId && <>Run: <code>{diagnostics.runId}</code><br /></>}
                                    {diagnostics.workflow?.engine === 'langgraph' && <>Workflow: LangGraph · checkpointed model/save boundary<br /></>}
                                    {Number.isFinite(diagnostics.durationMs) && `${(diagnostics.durationMs / 1000).toFixed(1)}s elapsed. `}
                                    {Number.isFinite(diagnostics.timeoutMs) && `${diagnostics.timeoutMs / 1000}s timeout. `}
                                    {Number.isInteger(diagnostics.httpStatus) && `Provider HTTP ${diagnostics.httpStatus}. `}
                                    {Number.isInteger(diagnostics.attempts) && `${diagnostics.attempts} attempt(s).`}
                                    {diagnostics.retryReason && ` Retry reason: ${diagnostics.retryReason}.`}
                                </p></details>}
                                {analysis.emailNotification && <p>Email notification: {({ sent: 'sent', sending: 'delivery outcome pending', skipped: 'not sent (disabled, no opt-in or authorization unavailable)', unavailable: 'delivery unavailable; report remains saved' })[analysis.emailNotification.status] || 'unknown'}.</p>}
                                {diagnostics?.pipeline?.stages?.length > 0 && <details className="ai-diagnostics"><summary>Review stages</summary><ul>{diagnostics.pipeline.stages.map((stage, index) => <li key={index}>{({ github: 'GitHub data', retrieval: 'Context retrieval', memory: 'Revision memory', model: 'AI request' })[stage.name] || 'Review step'}: {(stage.durationMs / 1000).toFixed(2)}s · {stage.status}</li>)}</ul><p>External trace: {diagnostics.tracing?.status || 'not recorded'}</p></details>}
                                {analysis.aiCoverage?.contextSources?.length > 0 && <details className="ai-diagnostics"><summary>Retrieved sources</summary><ul>{analysis.aiCoverage.contextSources.map((source, index) => <li key={index}><code>{source.filePath}:{source.startLine}–{source.endLine}</code> · {source.role} · {source.revision?.slice(0, 8) || 'revision unavailable'}</li>)}</ul></details>}
                                {analysis.aiCoverage?.memorySource && <p>Historical hints: {analysis.aiCoverage.memorySource.acceptedFindings} useful label(s) from <a href={`/analyses/${encodeURIComponent(analysis.aiCoverage.memorySource.analysisId)}`}>the previous revision</a>. Findings still require current code evidence.</p>}
                            </div>
                        </section>

                        <div hidden={activeView !== 'overview'}>
                            {review && <section className="report-section contextual-review" aria-labelledby="ai-review-title">
                                <p className="section-label">Contextual AI review · advisory</p>
                                <h2 id="ai-review-title">What changed and why it matters</h2>
                                <p className="review-summary">{review.summary}</p>
                                <p className="review-recommendation">{recommendationLabels[review.recommendation] || 'Human review required'}</p>
                                <p className="muted-text">This recommendation covers only the supplied context. It is not merge approval; verify findings and run your tests.</p>
                                <h3>Change walkthrough</h3>
                                {(review.walkthrough || []).map((item, index) => <article className="review-item" key={index}>
                                    <h4>{item.filePath}</h4><p>{item.description}</p>
                                    {(item.evidenceRefs || []).map((reference, refIndex) => <ReviewReference key={refIndex} reference={reference} files={files} onNavigate={setFocusLocation} />)}
                                </article>)}
                                <h3>Potential impact</h3>
                                {review.impacts?.length ? review.impacts.map((item, index) => <article className="review-item" key={index}><p>{item.description}</p>
                                    {(item.evidenceRefs || []).map((reference, refIndex) => <ReviewReference key={refIndex} reference={reference} files={files} onNavigate={setFocusLocation} />)}
                                </article>) : <p className="muted-text">No additional supported impact was returned for this context.</p>}
                                <details className="review-limitations" open><summary>Review limitations</summary><ul>{(review.limitations || []).map((limitation, index) => <li key={index}>{limitation}</li>)}</ul></details>
                            </section>}
                            {!review && <div className="review-empty"><Sparkles size={25} /><h3>No contextual AI review is available</h3><p className="muted-text">{analysis.sample ? 'This capture retains the recorded finding and diff. Open Findings to inspect them.' : 'Check the AI status above. Saved code changes and rule-based findings remain available in this workspace.'}</p></div>}
                        </div>
                        <section hidden={activeView !== 'findings'} aria-label="Findings">
                            {findings.length > 0 && <div className="finding-filters">
                                <label>Source<select value={sourceFilter} onChange={event => setSourceFilter(event.target.value)}><option value="all">All findings</option><option value="ai">AI findings</option><option value="rule">Rule-based</option></select></label>
                                <label>Severity<select value={severityFilter} onChange={event => setSeverityFilter(event.target.value)}><option value="all">All severities</option><option value="high">High</option><option value="medium">Medium</option><option value="low">Low</option></select></label>
                                <span className="muted-text" role="status">{visibleFindings.length} of {findings.length} shown</span>
                            </div>}
                            <div className="findings-list">
                                {visibleFindings.length === 0 ? <div className="no-findings"><CheckCircle2 size={22} /><p>{findings.length > 0 ? 'No findings match these filters.' : !successful ? 'No completed findings are available.' : analysis.aiStatus === 'completed' ? 'No validated findings were returned. This is advisory and does not guarantee the PR is safe.' : 'No rule-based findings were returned. Check the AI status above.'}</p></div> : visibleFindings.map((finding, index) => {
                                    const location = findDiffLocation(files, finding);
                                    return <article className="finding-card" key={`${finding.source}-${finding.filePath}-${finding.lineNumber}-${index}`}>
                                        <div className={`finding-icon ${finding.severity}`}><ShieldAlert size={18} /></div>
                                        <div className="finding-content">
                                            <div className="finding-meta"><span className="finding-category">{finding.source === 'ai' ? 'AI review' : finding.source === 'rule' ? 'Rule-based' : 'Saved finding'}</span><span className={`severity ${finding.severity}`}>{finding.severity}</span></div>
                                            <h3>{finding.title || finding.category?.replaceAll('-', ' ') || 'Review finding'}</h3>
                                            <p>{finding.explanation}</p>
                                            {finding.evidence && <pre className="finding-evidence"><code>{finding.evidence}</code></pre>}
                                            <div className="affected-files"><FileCode2 size={14} />{finding.filePath || finding.affectedFiles?.join(' · ') || 'Location not recorded'}</div>
                                            {location ? <button type="button" className="text-button" onClick={() => setFocusLocation({ filePath: finding.filePath, lineNumber: finding.lineNumber, lineSide: finding.lineSide || 'new' })}>View {finding.lineSide || 'new'} line {finding.lineNumber} in diff <ArrowUpRight size={14} /></button> : finding.filePath && <p className="location-note">A matching saved diff line is unavailable.</p>}
                                            <div className="action-line"><span>Suggested check</span>{finding.suggestedFix || finding.recommendedAction || 'Verify the finding before making changes.'}</div>
                                            {!analysis.sample?.readOnly && <FindingFeedback key={`${analysis.id}-${findings.indexOf(finding)}-${userId}`} analysisId={analysis.id} findingIndex={findings.indexOf(finding)} annotation={analysis.feedback?.[`${findings.indexOf(finding)}_${userId}`]} />}
                                        </div>
                                    </article>;
                                })}
                            </div>
                        </section>
                    </div>
                </aside>
            </div>
        </div>
    );
}

function AnalysisProgress({ stage = 'connecting', elapsedSeconds = 0, visitedStages = [] }) {
    const stages = [
        { id: 'fetching', label: 'Reading PR changes', message: 'Fetching the pull request and its changed files.' },
        { id: 'context', label: 'Building review context', message: 'Your context is being read. Please wait while relevant code is collected.' },
        { id: 'reviewing', label: 'Reviewing with AI', message: 'AI is reviewing the prepared context for potential bugs and impact.' },
        { id: 'saving', label: 'Saving your report', message: 'Saving validated findings and code changes.' }
    ];
    const active = stages.findIndex(item => item.id === stage);
    const current = stages[active] || { label: 'Connecting to PRism', message: 'Waiting for your review request to begin.' };
    return <section className="analysis-progress" aria-labelledby="progress-title">
        <div className="progress-heading">
            <div role="status" aria-live="polite"><LoaderCircle className="spin" size={19} aria-hidden="true" /><div><h3 id="progress-title">{current.label}</h3><p>{current.message}</p></div></div>
            <span className="elapsed-time">{elapsedSeconds}s elapsed</span>
        </div>
        <ol className="progress-stages" aria-label="Analysis stages">{stages.map((item, index) => {
            const state = active < 0 || index > active ? 'pending' : index === active ? 'active' : visitedStages.includes(item.id) ? 'complete' : 'skipped';
            return <li key={item.id} data-state={state} aria-current={state === 'active' ? 'step' : undefined}>
                {state === 'complete' ? <CheckCircle2 size={16} aria-hidden="true" /> : state === 'active' ? <LoaderCircle className="spin" size={16} aria-hidden="true" /> : <span className="step-number" aria-hidden="true">{state === 'skipped' ? '–' : index + 1}</span>}
                <span>{item.label}{state === 'skipped' ? ' · skipped' : ''}</span>
            </li>;
        })}</ol>
        <p className="progress-note">Response time varies with PR size and AI availability. Your report will appear when it is ready.</p>
    </section>;
}

function DashboardPage({ route = { page: 'overview' }, onNavigate, userId }) {
    const [pullRequestUrl, setPullRequestUrl] = useState('');
    const [analysis, setAnalysis] = useState(null);
    const [recentAnalyses, setRecentAnalyses] = useState([]);
    const [isSubmitting, setIsSubmitting] = useState(false);
    const [reportError, setReportError] = useState(null);
    const [reportReload, setReportReload] = useState(0);
    const [errorMessage, setErrorMessage] = useState('');
    const [historyStatus, setHistoryStatus] = useState('loading');
    const [historyError, setHistoryError] = useState('');
    const activeRequest = useRef(0);
    const historyRequest = useRef(0);
    const reviewRequest = useRef(null);
    const currentRoute = useRef(route);
    currentRoute.current = route;
    const startedAt = useRef(0);
    const [receivedStages, setReceivedStages] = useState([]);
    const progressStage = receivedStages.at(-1) || 'connecting';
    const [elapsedSeconds, setElapsedSeconds] = useState(0);

    async function refreshHistory() {
        const sequence = ++historyRequest.current;
        setHistoryStatus('loading');
        setHistoryError('');
        try {
            const results = await loadRecentAnalyses();
            if (sequence !== historyRequest.current) return;
            // A report created while history was loading must not disappear.
            setRecentAnalyses(current => [...new Map([...current, ...results].map(item => [item.id, item])).values()]
                .sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt)).slice(0, 20));
            setHistoryStatus('ready');
        } catch (error) {
            if (sequence !== historyRequest.current) return;
            setHistoryError(error.message);
            setHistoryStatus('error');
        }
    }

    useEffect(() => {
        refreshHistory();
        return () => { historyRequest.current++; activeRequest.current++; reviewRequest.current?.abort(); };
    }, []);

    useEffect(() => {
        if (!isSubmitting) return;
        const timer = setInterval(() => setElapsedSeconds(Math.floor((performance.now() - startedAt.current) / 1000)), 1000);
        return () => clearInterval(timer);
    }, [isSubmitting]);

    async function submitAnalysis(event) {
        event.preventDefault();
        if (reviewRequest.current) return;
        const sequence = ++activeRequest.current;
        const controller = new AbortController();
        reviewRequest.current = controller;
        startedAt.current = performance.now();
        setElapsedSeconds(0);
        setReceivedStages([]);
        setErrorMessage('');
        setIsSubmitting(true);
        let acceptedId;
        try {
            const result = await createAnalysis(pullRequestUrl.trim(), {
                signal: controller.signal,
                onAccepted: id => {
                    acceptedId = id;
                    controller.analysisId = id;
                    if (sequence === activeRequest.current) {
                        setReportError(null);
                        onNavigate?.('/analyses/' + encodeURIComponent(id));
                    }
                },
                onProgress: stage => {
                    controller.stage = stage;
                    if (sequence === activeRequest.current && (!acceptedId || currentRoute.current.analysisId === acceptedId)) setReceivedStages(current => [...current, stage]);
                }
            });
            if (sequence !== activeRequest.current) return;
            if (!acceptedId || currentRoute.current.analysisId === result.id) setAnalysis(result);
            setRecentAnalyses(current => [result, ...current.filter(item => item.id !== result.id)].slice(0, 20));
            if (!acceptedId && currentRoute.current.page === 'overview') onNavigate?.('/analyses/' + encodeURIComponent(result.id));
        } catch (error) {
            if (sequence === activeRequest.current) {
                setErrorMessage(error.message);
                if (acceptedId && currentRoute.current.analysisId === acceptedId) setReportError({ analysisId: acceptedId, message: error.message });
                refreshHistory();
            }
        } finally {
            if (reviewRequest.current === controller) reviewRequest.current = null;
            if (sequence === activeRequest.current) setIsSubmitting(false);
        }
    }

    useEffect(() => {
        if (route.page !== 'review' || analysis?.id === route.analysisId) return;
        if (reviewRequest.current?.analysisId === route.analysisId) {
            setReceivedStages([reviewRequest.current.stage || 'queued']);
            return;
        }
        setReportError(null);
        setReceivedStages([]);
        const controller = new AbortController();
        loadAnalysis(route.analysisId, { signal: controller.signal, onProgress: stage => { if (!controller.signal.aborted) setReceivedStages(current => [...current, stage]); } }).then(result => {
            if (!controller.signal.aborted) setAnalysis(result);
        }).catch(error => {
            if (!controller.signal.aborted) setReportError({ analysisId: route.analysisId, message: error.message });
        });
        return () => controller.abort();
    }, [route.page, route.analysisId, analysis?.id, reportReload]);
    const pageTitles = { overview: 'Start a new review', analyses: 'Saved analyses', review: 'Pull request review', 'not-found': 'Page not found' };
    const currentReport = route.page === 'review' && analysis?.id === route.analysisId ? analysis : null;
    return (
        <div className="app-frame">
            <aside className="sidebar">
                <RouteLink className="brand-lockup" to="/" onNavigate={onNavigate}><span className="brand-mark">P</span><span>PRism</span></RouteLink>
                <nav className="sidebar-nav" aria-label="Primary navigation">
                    <RouteLink className={`nav-item${route.page === 'overview' ? ' active' : ''}`} aria-current={route.page === 'overview' ? 'page' : undefined} to="/app" onNavigate={onNavigate}><ClipboardCheck size={17} />New review</RouteLink>
                    <RouteLink className={`nav-item${['analyses', 'review'].includes(route.page) ? ' active' : ''}`} aria-current={route.page === 'analyses' ? 'page' : undefined} to="/analyses" onNavigate={onNavigate}><GitPullRequest size={17} />Analyses</RouteLink>
                </nav>
                {isSubmitting ? <RouteLink className="running-review" to="/app" onNavigate={onNavigate}><LoaderCircle className="spin" size={15} />Review in progress</RouteLink> : <div className="sidebar-note"><Sparkles size={16} /><span>Review support for the changes that matter.</span></div>}
            </aside>
            <main className={`dashboard-shell page-${route.page}`}>
                <header className="topbar"><div><p className="eyebrow">Workspace / {route.page === 'overview' ? 'New review' : 'Analyses'}</p><h1 tabIndex={-1}>{pageTitles[route.page] || 'Page not found'}</h1><p className="muted-text">{route.page === 'overview' ? 'Bring a pull request into focus with code changes and grounded feedback.' : route.page === 'analyses' ? 'Reopen a saved report and inspect its exact revision.' : 'Inspect the saved diff, context and advisory findings.'}</p></div><span className="beta-badge">V0 <span className="status-dot" /></span></header>
                {route.page === 'overview' && <OverviewPage pullRequestUrl={pullRequestUrl} onUrlChange={setPullRequestUrl} onSubmit={submitAnalysis} isSubmitting={isSubmitting} error={errorMessage} progressStage={progressStage} elapsedSeconds={elapsedSeconds} receivedStages={receivedStages} onNavigate={onNavigate} />}
                {route.page === 'analyses' && <AnalysesPage reports={recentAnalyses} status={historyStatus} error={historyError} onReload={refreshHistory} onNavigate={onNavigate} />}
                {route.page === 'review' && <ReviewPage userId={userId} analysis={currentReport} pendingStage={progressStage} error={reportError?.analysisId === route.analysisId ? reportError.message : ''} onRetry={() => setReportReload(value => value + 1)} onNavigate={onNavigate} />}
                {route.page === 'not-found' && <section className="welcome-section"><div><h2>This page does not exist</h2><p className="muted-text">Choose a destination from the navigation or start a new review.</p><RouteLink className="text-button" to="/app" onNavigate={onNavigate}>Back to new review</RouteLink></div></section>}
            </main>
        </div>
    );
}

function RouteLink({ to, onNavigate, children, ...props }) {
    return <a {...props} href={to} onClick={event => {
        if (onNavigate && !event.defaultPrevented && event.button === 0 && !event.metaKey && !event.ctrlKey && !event.shiftKey && !event.altKey && !event.currentTarget.target) {
            event.preventDefault();
            onNavigate(to);
        }
    }}>{children}</a>;
}

function OverviewPage({ pullRequestUrl = '', onUrlChange, onSubmit, isSubmitting, error, progressStage, elapsedSeconds, receivedStages, onNavigate }) {
    return <div className="overview-content">
        <section className="submit-panel" aria-labelledby="submit-title">
            <div className="panel-heading"><div className="heading-icon"><GitPullRequest size={20} /></div><div><p className="section-label">New review</p><h2 id="submit-title">Open a pull request</h2></div></div>
            <form className="submit-form" onSubmit={onSubmit} aria-busy={isSubmitting}>
                <label htmlFor="pull-request-url">GitHub Pull Request URL</label>
                <div className="input-row"><input id="pull-request-url" type="url" placeholder="https://github.com/org/repository/pull/42" value={pullRequestUrl} onChange={event => onUrlChange(event.target.value)} disabled={isSubmitting} required /><button type="submit" disabled={isSubmitting}>{isSubmitting ? <LoaderCircle className="spin" size={17} /> : <ArrowUpRight size={17} />}{isSubmitting ? 'Review in progress…' : 'Analyze PR'}</button></div>
                {error && <p className="error-message" role="alert"><AlertTriangle size={16} />{error}</p>}
            </form>
            {isSubmitting && <AnalysisProgress stage={progressStage} elapsedSeconds={elapsedSeconds} visitedStages={receivedStages} />}
        </section>
        <section className="welcome-section"><div className="welcome-icon"><Sparkles size={24} /></div><div><h2>One PR. A clearer review.</h2><p className="muted-text">Read the diff, understand potential impact and inspect findings with code evidence. AI feedback remains advisory.</p><RouteLink className="text-button" to="/analyses" onNavigate={onNavigate}>Browse saved analyses <ArrowUpRight size={15} /></RouteLink></div></section>
    </div>;
}

function AnalysesPage({ reports = [], status = 'loading', error, onReload, onNavigate }) {
    return <section className="history-section" aria-busy={status === 'loading'}>
        <div className="section-heading"><div><p className="section-label">History</p><h2>Recent analyses</h2></div><span className="history-count">{reports.length} shown</span></div>
        {status === 'loading' && <p className="muted-text" role="status">Loading saved reports…</p>}
        {status === 'error' && <div className="history-error" role="alert"><p className="error-message">{error}</p><button className="text-button" type="button" onClick={onReload}>Reload history</button></div>}
        {status === 'ready' && reports.length === 0 && <div className="empty-state"><p className="muted-text">No saved reports yet.</p><RouteLink className="text-button" to="/app" onNavigate={onNavigate}>Start your first review</RouteLink></div>}
        <div className="history-list">{reports.map(item => <RouteLink className="history-item" to={'/analyses/' + encodeURIComponent(item.id)} onNavigate={onNavigate} key={item.id}>
            <span><strong>{item.pullRequest?.title || 'Failed analysis'}</strong><small>{item.pullRequest?.repository || item.pullRequest?.url}</small><small>{formatDate(item.createdAt)}{item.pullRequest?.headSha && ` · ${item.pullRequest.headSha.slice(0, 8)}`}</small></span>
            <span className={`history-status ${item.status}`}>{item.status === 'failed' ? 'Failed' : item.aiStatus === 'completed' ? 'AI completed' : item.aiStatus === 'partial' ? 'AI partial' : 'Rules completed'}</span>
        </RouteLink>)}</div>
    </section>;
}

function ReviewPage({ analysis, error, onRetry, onNavigate, userId, pendingStage }) {
    return <>
        <RouteLink className="text-button back-link" to="/analyses" onNavigate={onNavigate}>← All analyses</RouteLink>
        {error ? <section className="welcome-section" role="alert"><AlertTriangle size={21} /><div><h2>Report could not be opened</h2><p className="muted-text">{error}</p><button type="button" className="text-button" onClick={onRetry}>Try again</button></div></section>
            : analysis ? <AnalysisReport key={analysis.id} analysis={analysis} userId={userId} />
                : ['queued', 'running'].includes(pendingStage)
                    ? <section className="welcome-section" role="status"><LoaderCircle className="spin" size={18} /><div><h2>{pendingStage === 'queued' ? 'Review queued' : 'Review running'}</h2><p>You can close this page and reopen this URL later. Accepted work continues on the server.</p></div></section>
                    : <p className="report-loading muted-text" role="status"><LoaderCircle className="spin" size={18} />Loading saved report…</p>}
    </>;
}
function DemoPage({ onNavigate }) {
    const [report, setReport] = useState(null);
    const [error, setError] = useState('');
    const [attempt, setAttempt] = useState(0);
    useEffect(() => {
        const controller = new AbortController();
        setError(''); setReport(null);
        loadDemoAnalysis({ signal: controller.signal }).then(value => { if (!controller.signal.aborted) setReport(value); })
            .catch(failure => { if (!controller.signal.aborted) setError(failure.message); });
        return () => controller.abort();
    }, [attempt]);
    return <main className="public-demo"><RouteLink to="/" onNavigate={onNavigate} className="text-button">← PRism AI home</RouteLink><h1>Explore a recorded review</h1>
        {error ? <section role="alert"><p>{error}</p><button type="button" className="text-button" onClick={() => setAttempt(value => value + 1)}>Retry sample</button></section>
            : report ? <AnalysisReport analysis={report} /> : <p role="status">Loading recorded review…</p>}
    </main>;
}

export { AnalysisReport, AnalysisProgress, OverviewPage, AnalysesPage, ReviewPage, DemoPage, getAiStatusDetails, RouteLink };
export default DashboardPage;
