import { AlertTriangle, ArrowUpRight, CheckCircle2, ClipboardCheck, FileCode2, GitPullRequest, LoaderCircle, ShieldAlert, Sparkles } from 'lucide-react';
import { useEffect, useState } from 'react';

const apiBaseUrl = 'http://localhost:5000/api';

// Load recent analyses so the dashboard has a useful starting state.
async function loadRecentAnalyses() {
    const response = await fetch(`${apiBaseUrl}/analyses`);

    if (!response.ok) {
        throw new Error('Recent analyses could not be loaded.');
    }

    return response.json();
}

// Render the reviewer dashboard and the first Pull Request submission flow.
function DashboardPage() {
    const [pullRequestUrl, setPullRequestUrl] = useState('');
    const [analysis, setAnalysis] = useState(null);
    const [recentAnalyses, setRecentAnalyses] = useState([]);
    const [isSubmitting, setIsSubmitting] = useState(false);
    const [errorMessage, setErrorMessage] = useState('');

    useEffect(() => {
        loadRecentAnalyses().then(setRecentAnalyses).catch(() => setRecentAnalyses([]));
    }, []);

    // Submit a Pull Request URL to the API and display its normalized report.
    async function submitAnalysis(event) {
        event.preventDefault();
        setErrorMessage('');
        setIsSubmitting(true);

        try {
            const response = await fetch(`${apiBaseUrl}/analyses`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ pullRequestUrl })
            });
            const result = await response.json();

            if (!response.ok) {
                throw new Error(result.error || result.message || 'Analysis could not be created.');
            }

            setAnalysis(result);
            setRecentAnalyses((currentAnalyses) => [result, ...currentAnalyses.filter((item) => item.id !== result.id)]);
        } catch (error) {
            setErrorMessage(error.message);
        } finally {
            setIsSubmitting(false);
        }
    }

    // Open a previous report from the compact history list.
    async function openAnalysis(analysisId) {
        const response = await fetch(`${apiBaseUrl}/analyses/${analysisId}`);
        const result = await response.json();
        setAnalysis(result);
    }

    const findings = analysis?.findings || [];

    return (
    <div className="app-frame">
        <aside className="sidebar">
            <div className="brand-lockup"><span className="brand-mark">P</span><span>PRism</span></div>
            <nav className="sidebar-nav" aria-label="Primary navigation">
                <a className="nav-item active" href="#overview"><ClipboardCheck size={17} />Overview</a>
                <a className="nav-item" href="#history"><GitPullRequest size={17} />Analyses</a>
            </nav>
            <div className="sidebar-note"><Sparkles size={16} /><span>Review support for the changes that matter.</span></div>
        </aside>
        <main className="dashboard-shell" id="overview">
            <header className="topbar"><div><p className="eyebrow">Workspace / Overview</p><h1>Pull Request review, with context.</h1></div><span className="beta-badge">BETA <span className="status-dot" /></span></header>
            <section className="submit-panel" aria-labelledby="submit-title">
                <div className="panel-heading"><div className="heading-icon"><GitPullRequest size={20} /></div><div><p className="section-label">Start an analysis</p><h2 id="submit-title">Bring a Pull Request into focus.</h2></div></div>
                <form className="submit-form" onSubmit={submitAnalysis}>
                    <label htmlFor="pull-request-url">GitHub Pull Request URL</label>
                    <div className="input-row"><input id="pull-request-url" type="url" placeholder="https://github.com/org/repository/pull/42" value={pullRequestUrl} onChange={(event) => setPullRequestUrl(event.target.value)} required /><button type="submit" disabled={isSubmitting}>{isSubmitting ? <LoaderCircle className="spin" size={17} /> : <ArrowUpRight size={17} />}{isSubmitting ? 'Analyzing' : 'Analyze PR'}</button></div>
                    {errorMessage && <p className="error-message"><AlertTriangle size={16} />{errorMessage}</p>}
                </form>
            </section>
            {analysis ? <section className="report-section" aria-labelledby="report-title"><div className="section-heading"><div><p className="section-label">Latest report</p><h2 id="report-title">{analysis.pullRequest?.title || 'Analysis result'}</h2><p className="muted-text">{analysis.pullRequest?.repository} · opened by {analysis.pullRequest?.author}</p></div><span className={`report-status ${analysis.status}`}><CheckCircle2 size={15} />{analysis.status}</span></div><div className="risk-summary"><div><span className="summary-number">{findings.length}</span><span className="summary-label">findings</span></div><div><span className="summary-number high">{findings.filter((finding) => finding.severity === 'high').length}</span><span className="summary-label">high attention</span></div><div><span className="summary-number">{analysis.pullRequest?.changedFiles?.length || 0}</span><span className="summary-label">files changed</span></div></div><div className="findings-list">{findings.length === 0 ? <div className="no-findings"><CheckCircle2 size={22} /><p>No risk signals found by the beta rules.</p></div> : findings.map((finding) => <article className="finding-card" key={`${finding.category}-${finding.evidence}`}><div className={`finding-icon ${finding.severity}`}><ShieldAlert size={18} /></div><div className="finding-content"><div className="finding-meta"><span className="finding-category">{finding.category.replace('-', ' ')}</span><span className={`severity ${finding.severity}`}>{finding.severity}</span></div><h3>{finding.explanation}</h3><p>{finding.evidence}</p><div className="affected-files"><FileCode2 size={14} />{finding.affectedFiles.join(' · ')}</div><div className="action-line"><span>Next check</span>{finding.recommendedAction}</div></div></article>)}</div></section> : <section className="welcome-section"><div className="welcome-icon"><Sparkles size={24} /></div><div><p className="section-label">Ready when you are</p><h2>Your next analysis will appear here.</h2><p className="muted-text">Paste a GitHub Pull Request above to see changed files, rule-based risks, and review actions.</p></div></section>}
            <section className="history-section" id="history"><div className="section-heading"><div><p className="section-label">History</p><h2>Recent analyses</h2></div><span className="history-count">{recentAnalyses.length} saved</span></div>{recentAnalyses.length === 0 ? <p className="muted-text">No analyses yet. Your completed reports will stay here.</p> : <div className="history-list">{recentAnalyses.slice(0, 5).map((item) => <button className="history-item" type="button" key={item.id} onClick={() => openAnalysis(item.id)}><span><strong>{item.pullRequest?.title || 'Failed analysis'}</strong><small>{item.pullRequest?.repository || item.pullRequest?.url}</small></span><span className={`history-status ${item.status}`}>{item.status}</span></button>)}</div>}</section>
        </main>
    </div>
    );
}

export default DashboardPage;