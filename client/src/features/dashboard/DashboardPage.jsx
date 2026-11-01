import { AlertTriangle, ArrowUpRight, CheckCircle2, ClipboardCheck, FileCode2, GitPullRequest, LoaderCircle, ShieldAlert, Sparkles } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import DiffViewer, { findDiffLocation } from './DiffViewer.jsx';
import { createAnalysis, loadAnalysis, loadRecentAnalyses } from './analysis.api.js';

function getAiStatusDetails(analysis) {
    if (analysis.status === 'failed') {
        return { tone: 'warning', label: 'AI review not completed', message: 'The PR analysis failed. No successful AI review is confirmed.' };
    }
    if (analysis.aiStatus === 'completed') {
        return { tone: 'success', label: 'AI analysis completed', message: 'Gemini returned a validated response. Findings remain advisory.' };
    }
    if (analysis.aiStatus === 'partial') {
        return { tone: 'warning', label: 'AI analysis partial', message: analysis.aiError === 'INVALID_FINDINGS' ? 'Some AI findings were rejected. Available validated findings and completed rule-based results are shown.' : 'AI reviewed limited diff context. Available validated findings and completed rule-based results are shown.' };
    }

    const rulesMessage = analysis.status === 'completed' ? 'Rule-based analysis completed; its results remain available.' : 'Rule-based completion is not confirmed for this report.';
    if (analysis.aiStatus === 'unavailable' || analysis.aiStatus === 'failed') {
        const errors = {
            TIMEOUT: 'The AI request timed out.',
            API_ERROR: 'The AI provider could not complete the request.',
            INVALID_RESPONSE: 'The AI response could not be validated.',
            INVALID_FINDINGS: 'The AI findings could not be validated.',
            INVALID_REVIEW: 'The AI review explanation could not be validated. Any valid findings are shown separately.',
            INVALID_TIMEOUT: 'AI request configuration needs attention.'
        };
        const reason = analysis.aiError === 'API_ERROR' && analysis.aiDiagnostics?.httpStatus === 504
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

function AnalysisReport({ analysis }) {
    const [activeView, setActiveView] = useState('overview');
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
                    <span>{formatDate(analysis.createdAt)}</span>
                    {pr.headSha ? <code title={pr.headSha}>{pr.headBranch} @ {pr.headSha.slice(0, 8)}</code> : <span>Revision not recorded in this older report</span>}
                    {pr.baseSha && <code title={pr.baseSha}>base {pr.baseBranch} @ {pr.baseSha.slice(0, 8)}</code>}
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
                                {analysis.aiCoverage && <p>AI input: {analysis.aiCoverage.analyzedFiles ?? 0} of {analysis.aiCoverage.totalFiles ?? files.length} fetched files included; {analysis.aiCoverage.skippedFiles?.length || 0} skipped; {analysis.aiCoverage.truncatedFiles?.length || 0} limited patches. Prepared input does not confirm a successful AI review.</p>}
                                {analysis.aiCoverage && <p>{analysis.aiCoverage.contextSnippets || 0} source windows included; {analysis.aiCoverage.contextOmissions?.length || 0} context omissions. Direct-import retrieval is limited and does not trace every caller.</p>}
                                {analysis.aiStatus === 'partial' && analysis.aiError === 'INVALID_REVIEW' && <p>The AI explanation was rejected because its structure or code references could not be validated.</p>}
                                {diagnostics && <details className="ai-diagnostics"><summary>Request details</summary><p>
                                    {Number.isFinite(diagnostics.durationMs) && `${(diagnostics.durationMs / 1000).toFixed(1)}s elapsed. `}
                                    {Number.isFinite(diagnostics.timeoutMs) && `${diagnostics.timeoutMs / 1000}s timeout. `}
                                    {Number.isInteger(diagnostics.httpStatus) && `Provider HTTP ${diagnostics.httpStatus}. `}
                                    {Number.isInteger(diagnostics.attempts) && `${diagnostics.attempts} attempt(s).`}
                                </p></details>}
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
                            {!review && <div className="review-empty"><Sparkles size={25} /><h3>No contextual AI review is available</h3><p className="muted-text">Check the AI status above. Saved code changes and rule-based findings remain available in this workspace.</p></div>}
                        </div>
                        <section hidden={activeView !== 'findings'} aria-label="Findings">
                            {findings.length > 0 && <div className="finding-filters">
                                <label>Source<select value={sourceFilter} onChange={event => setSourceFilter(event.target.value)}><option value="all">All findings</option><option value="ai">AI findings</option><option value="rule">Rule-based</option></select></label>
                                <label>Severity<select value={severityFilter} onChange={event => setSeverityFilter(event.target.value)}><option value="all">All severities</option><option value="high">High</option><option value="medium">Medium</option><option value="low">Low</option></select></label>
                                <span className="muted-text" role="status">{visibleFindings.length} of {findings.length} shown</span>
                            </div>}
                            <div className="findings-list">
                                {visibleFindings.length === 0 ? <div className="no-findings"><CheckCircle2 size={22} /><p>{findings.length > 0 ? 'No findings match these filters.' : !successful ? 'No completed findings are available.' : analysis.aiStatus === 'completed' ? 'No validated findings were returned. This is advisory and does not guarantee the PR is safe.' : 'No rule-based findings were returned. Check the AI status below.'}</p></div> : visibleFindings.map((finding, index) => {
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

function DashboardPage() {
    const [pullRequestUrl, setPullRequestUrl] = useState('');
    const [analysis, setAnalysis] = useState(null);
    const [recentAnalyses, setRecentAnalyses] = useState([]);
    const [isSubmitting, setIsSubmitting] = useState(false);
    const [openingId, setOpeningId] = useState(null);
    const [errorMessage, setErrorMessage] = useState('');
    const [historyStatus, setHistoryStatus] = useState('loading');
    const [historyError, setHistoryError] = useState('');
    const activeRequest = useRef(0);
    const historyRequest = useRef(0);

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
        return () => { historyRequest.current++; activeRequest.current++; };
    }, []);

    async function submitAnalysis(event) {
        event.preventDefault();
        const sequence = ++activeRequest.current;
        setErrorMessage('');
        setOpeningId(null);
        setIsSubmitting(true);
        try {
            const result = await createAnalysis(pullRequestUrl.trim());
            if (sequence !== activeRequest.current) return;
            setAnalysis(result);
            setRecentAnalyses(current => [result, ...current.filter(item => item.id !== result.id)].slice(0, 20));
        } catch (error) {
            if (sequence === activeRequest.current) { setErrorMessage(error.message); refreshHistory(); }
        } finally {
            if (sequence === activeRequest.current) setIsSubmitting(false);
        }
    }

    async function openAnalysis(id) {
        const sequence = ++activeRequest.current;
        setOpeningId(id);
        setErrorMessage('');
        try {
            const result = await loadAnalysis(id);
            if (sequence === activeRequest.current) setAnalysis(result);
        } catch (error) {
            if (sequence === activeRequest.current) setErrorMessage(error.message);
        } finally {
            if (sequence === activeRequest.current) setOpeningId(null);
        }
    }

    return (
        <div className="app-frame">
            <aside className="sidebar">
                <div className="brand-lockup"><span className="brand-mark">P</span><span>PRism</span></div>
                <nav className="sidebar-nav" aria-label="Primary navigation">
                    <a className="nav-item" href="#overview"><ClipboardCheck size={17} />Overview</a>
                    <a className="nav-item" href="#history"><GitPullRequest size={17} />Analyses</a>
                </nav>
                <div className="sidebar-note"><Sparkles size={16} /><span>Review support for the changes that matter.</span></div>
            </aside>
            <main className="dashboard-shell" id="overview">
                <header className="topbar"><div><p className="eyebrow">Workspace / Reviews</p><h1>Pull request workspace</h1><p className="muted-text">Code changes, grounded feedback, and your next review decision.</p></div><span className="beta-badge">V0 <span className="status-dot" /></span></header>
                <section className="submit-panel" aria-labelledby="submit-title">
                    <div className="panel-heading"><div className="heading-icon"><GitPullRequest size={20} /></div><div><p className="section-label">New review</p><h2 id="submit-title">Open a pull request</h2></div></div>
                    <form className="submit-form" onSubmit={submitAnalysis}>
                        <label htmlFor="pull-request-url">GitHub Pull Request URL</label>
                        <div className="input-row"><input id="pull-request-url" type="url" placeholder="https://github.com/org/repository/pull/42" value={pullRequestUrl} onChange={event => setPullRequestUrl(event.target.value)} required /><button type="submit" disabled={isSubmitting}>{isSubmitting ? <LoaderCircle className="spin" size={17} /> : <ArrowUpRight size={17} />}{isSubmitting ? 'Analyzing…' : 'Analyze PR'}</button></div>
                        {isSubmitting && <p className="muted-text" role="status">Fetching changed files and running checks. AI may take up to the configured timeout; please keep this page open.</p>}
                        {errorMessage && <p className="error-message" role="alert"><AlertTriangle size={16} />{errorMessage}</p>}
                    </form>
                </section>
                {openingId && <p className="muted-text" role="status">Opening saved report…</p>}
                {analysis ? <AnalysisReport key={analysis.id} analysis={analysis} /> : <section className="welcome-section"><div className="welcome-icon"><Sparkles size={24} /></div><div><p className="section-label">Ready when you are</p><h2>Your next analysis will appear here.</h2><p className="muted-text">Paste a PR URL to inspect saved code changes, rule-based checks, and validated AI findings when available.</p></div></section>}
                <section className="history-section" id="history" aria-busy={historyStatus === 'loading'}>
                    <div className="section-heading"><div><p className="section-label">History</p><h2>Recent analyses</h2></div><span className="history-count">{recentAnalyses.length} shown</span></div>
                    {historyStatus === 'loading' && <p className="muted-text" role="status">Loading saved reports…</p>}
                    {historyStatus === 'error' && <div className="history-error" role="alert"><p className="error-message">{historyError}</p><button className="text-button" type="button" onClick={refreshHistory}>Reload history</button></div>}
                    {historyStatus === 'ready' && recentAnalyses.length === 0 && <p className="muted-text">No saved reports yet. Analyze a PR to get started.</p>}
                    <div className="history-list">{recentAnalyses.map(item => <button className="history-item" type="button" key={item.id} disabled={isSubmitting} aria-pressed={analysis?.id === item.id} onClick={() => openAnalysis(item.id)}>
                        <span><strong>{item.pullRequest?.title || 'Failed analysis'}</strong><small>{item.pullRequest?.repository || item.pullRequest?.url}</small><small>{formatDate(item.createdAt)}{item.pullRequest?.headSha && ` · ${item.pullRequest.headSha.slice(0, 8)}`}</small></span>
                        <span className={`history-status ${item.status}`}>{openingId === item.id ? 'Opening…' : item.status === 'failed' ? 'Failed' : item.aiStatus === 'completed' ? 'AI completed' : item.aiStatus === 'partial' ? 'AI partial' : 'Rules completed'}</span>
                    </button>)}</div>
                </section>
            </main>
        </div>
    );
}

export { AnalysisReport, getAiStatusDetails };
export default DashboardPage;
