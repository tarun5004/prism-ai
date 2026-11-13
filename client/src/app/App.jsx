import { useCallback, useEffect, useRef, useState } from 'react';
import DashboardPage, { RouteLink, DemoPage } from '../features/dashboard/DashboardPage.jsx';
import { loadGitHubSession, logoutGitHub, githubLoginUrl, setEmailNotifications } from '../features/dashboard/analysis.api.js';

function EmailPreference({ session, busy, onChange }) {
  return <label title={session.emailAvailable ? 'Send a report link to your verified GitHub email. Reconnect when authorization expires.' : 'Email delivery is not configured on this deployment.'}>
    <input type="checkbox" checked={Boolean(session.emailNotifications)} disabled={busy || !session.emailAvailable} onChange={event => onChange(event.target.checked)} /> Review-ready emails
  </label>;
}

function resolveRoute(pathname) {
  const path = pathname.replace(/\/+$/, '') || '/';
  if (path === '/') return { page: 'landing' };
  if (path === '/demo') return { page: 'demo' };
  if (path === '/app') return { page: 'overview' };
  if (path === '/analyses') return { page: 'analyses' };
  const match = path.match(/^\/analyses\/([^/]+)$/);
  if (match) {
    try {
      const analysisId = decodeURIComponent(match[1]);
      if (/^[a-z\d_-]{1,128}$/i.test(analysisId)) return { page: 'review', analysisId };
    } catch { /* Invalid URL escapes belong on the not-found page. */ }
  }
  return { page: 'not-found' };
}

function App() {
  const [session, setSession] = useState(null);
  const [connectionError, setConnectionError] = useState('');
  const [connectionBusy, setConnectionBusy] = useState(false);
  const refreshSession = useCallback(async () => {
    setConnectionBusy(true); setConnectionError('');
    try { setSession(await loadGitHubSession()); }
    catch (error) { setConnectionError(error.message); }
    finally { setConnectionBusy(false); }
  }, []);
  useEffect(() => { void refreshSession(); }, [refreshSession]);
  async function signOut() {
    setConnectionBusy(true); setConnectionError('');
    try { await logoutGitHub(); setSession(previous => ({ ...previous, authenticated: false, login: null, userId: null })); }
    catch (error) { setConnectionError(error.message); }
    finally { setConnectionBusy(false); }
  }
  async function changeEmailPreference(enabled) {
    setConnectionBusy(true); setConnectionError('');
    try { const result = await setEmailNotifications(enabled); setSession(previous => ({ ...previous, emailNotifications: result.enabled })); }
    catch (error) { setConnectionError(error.message); }
    finally { setConnectionBusy(false); }
  }
  const [pathname, setPathname] = useState(() => typeof window === 'undefined' ? '/' : window.location.pathname);
  const route = resolveRoute(pathname);
  const [workspaceVisited, setWorkspaceVisited] = useState(() => !['landing', 'demo'].includes(resolveRoute(pathname).page));
  const lastWorkspaceRoute = useRef(route);
  const navigate = useCallback(path => {
    const destination = new URL(path, window.location.origin);
    if (destination.origin !== window.location.origin) return;
    if (destination.pathname !== window.location.pathname) window.history.pushState(null, '', destination.pathname);
    setPathname(destination.pathname);
  }, []);

  useEffect(() => {
    // Preserve old bookmarks after replacing the one-page anchor navigation.
    if (window.location.pathname === '/' && window.location.hash === '#history') {
      window.history.replaceState(null, '', '/analyses');
      setPathname('/analyses');
    }
    const onPopState = () => setPathname(window.location.pathname);
    window.addEventListener('popstate', onPopState);
    return () => window.removeEventListener('popstate', onPopState);
  }, []);

  useEffect(() => {
    const page = resolveRoute(pathname).page;
    if (page !== 'landing' && page !== 'demo') {
      lastWorkspaceRoute.current = resolveRoute(pathname);
      setWorkspaceVisited(true);
    }
    document.title = `${{ landing: 'Understand every change', demo: 'Recorded review', overview: 'New review', analyses: 'Saved analyses', review: 'PR review', 'not-found': 'Page not found' }[page]} · PRism AI`;
    document.querySelector(page === 'landing' ? '.landing h1' : page === 'demo' ? '.public-demo h1' : '.dashboard-shell h1')?.focus({ preventScroll: true });
    window.scrollTo(0, 0);
  }, [pathname]);

  return <>
    {(session?.enabled || connectionError) && <div className="connection-bar">
      <span>{session?.authenticated ? `Connected as ${session.login}` : 'Connect GitHub to review your installed repositories.'}</span>
      {session?.installUrl && <a href={session.installUrl}>Install on GitHub ↗</a>}
      {session?.authenticated ? <button type="button" disabled={connectionBusy} onClick={signOut}>Sign out</button> : <a href={githubLoginUrl}>Connect GitHub</a>}
      {session?.authenticated && <EmailPreference session={session} busy={connectionBusy} onChange={changeEmailPreference} />}
      {connectionError && <><span role="alert">{connectionError}</span><button type="button" disabled={connectionBusy} onClick={refreshSession}>Retry connection</button></>}
    </div>}
    {route.page === 'landing' && <LandingPage onNavigate={navigate} />}
    {route.page === 'demo' && <DemoPage onNavigate={navigate} />}
    {/* Keep an active review mounted when its user visits the introduction. */}
    {(workspaceVisited || !['landing', 'demo'].includes(route.page)) && (session && !session.demoOnly && (!session.enabled || session.authenticated)
      ? <div hidden={['landing', 'demo'].includes(route.page)}><DashboardPage route={['landing', 'demo'].includes(route.page) ? lastWorkspaceRoute.current : route} onNavigate={navigate} userId={session.userId || 'local'} /></div>
      : !['landing', 'demo'].includes(route.page) && <main className="connection-welcome"><h1>GitHub workspace</h1><p role="status">{!session ? connectionError || 'Checking connection…' : session.demoOnly ? 'This hosted demo offers a recorded review. Live repository access is disabled.' : 'Install PRism on selected repositories, then connect GitHub to open your private workspace.'}</p>{session?.enabled && <a href={githubLoginUrl}>Connect GitHub</a>} <RouteLink to="/demo" onNavigate={navigate}>Explore recorded review →</RouteLink></main>)}
  </>;
}

const features = [
  { name: 'Review', title: 'Feedback grounded in your changes.', description: 'Inspect potential bugs, security issues and logic errors with explanations, suggested fixes and saved code evidence.', tag: 'Evidence-backed findings', code: ['− return issueSession(payload.userId);', '+ if (payload.expiresAt <= Date.now()) return null;', '+ return issueSession(payload.userId);'], note: 'A finding links back to its file and old or new diff line.' },
  { name: 'Understand', title: 'Read the change. Understand the impact.', description: 'Explore the PR summary, per-file walkthrough and potential effects alongside the code that changed.', tag: 'Context and impact', code: ['PR intent → changed code', 'Changed source → nearby context', 'Direct imports → bounded enrichment'], note: 'Coverage and limitations stay visible when context is incomplete.' },
  { name: 'Inspect', title: 'Every addition. Every deletion.', description: 'Navigate changed files and unified patches with old/new line numbers. Unavailable patches are called out clearly.', tag: 'Unified diff viewer', code: ['@@ -12,2 +12,3 @@', '− const total = price;', '+ const total = price * quantity;', '+ return total;'], note: 'Added and deleted lines remain distinct across multiple hunks.' },
  { name: 'Revisit', title: 'A review worth coming back to.', description: 'Reopen saved analyses and inspect the exact PR revision, findings and AI status behind each report.', tag: 'Saved revisions', code: ['PR URL → GitHub revision', 'Review → validated evidence', 'Saved report → shareable local route'], note: 'Rule-based results remain available when AI is unavailable.' }
];
const contextSteps = [
  { name: 'PR intent', title: 'Start with what the PR is trying to do.', description: 'The PR description and changed files frame the review. GitHub base and head revisions identify the code being inspected.', nodes: ['PR description', 'Base + head SHA', 'Changed files'] },
  { name: 'Relevant code', title: 'Bring nearby code into the picture.', description: 'Bounded source windows and selected direct imports supplement the diff. Missing, oversized or unavailable context is reported rather than guessed.', nodes: ['Unified patches', 'Source windows', 'Direct imports'] },
  { name: 'Validated review', title: 'Keep feedback connected to evidence.', description: 'AI findings are checked against supplied files, line references and evidence before being saved. Coverage and advisory guidance accompany the report.', nodes: ['AI + rules', 'Evidence validation', 'Saved report'] }
];

function FeaturePreview({ feature }) {
  return <div className="product-preview">
    <div className="preview-bar"><span><span className="preview-dot" /> PRism AI / pull request review</span><span>Illustrative preview</span></div>
    <div className="preview-body"><aside className="preview-files"><span className="mono-label">REVIEW WORKSPACE</span><strong>Files & context</strong><span>src/session.js</span><span>src/session.test.js</span><span className="preview-chip">Diff preserved</span></aside>
      <div className="preview-review"><div className="preview-review-heading"><span className="brand-mark">P</span><span>PRism review <small> / {feature.name}</small></span></div><span className="preview-chip">{feature.tag}</span><h3>{feature.title}</h3><div className="preview-code">{feature.code.map((line, index) => <div className={line.startsWith('+') ? 'preview-added' : line.startsWith('−') ? 'preview-deleted' : ''} key={index}><span aria-hidden="true">{index + 12}</span><code>{line}</code></div>)}</div><p>{feature.note}</p><small>Example only · AI feedback is advisory</small></div>
    </div>
  </div>;
}

function FeatureShowcase({ activeIndex, onSelect }) {
  return <section className="landing-showcase landing-width" aria-label="Explore PRism features">
    {features.map((feature, index) => <article className="showcase-card" data-expanded={activeIndex === index} key={feature.name}
      onPointerEnter={event => { if (event.pointerType !== 'touch') onSelect(index); }}>
      <button type="button" className="showcase-card-trigger" aria-expanded={activeIndex === index} aria-controls={`feature-card-${index}`}
        onFocus={() => onSelect(index)} onClick={() => onSelect(index)}>
        <span>0{index + 1}</span><strong>{feature.name}</strong><span aria-hidden="true">↗</span>
      </button>
      <div id={`feature-card-${index}`} aria-hidden={activeIndex !== index} inert={activeIndex !== index} className="showcase-card-content">
        <div className="showcase-card-inner"><FeaturePreview feature={feature} /></div>
      </div>
    </article>)}
  </section>;
}

function LandingPage({ onNavigate }) {
  const [activeFeature, setActiveFeature] = useState(0);
  const [activeContext, setActiveContext] = useState(0);
  const context = contextSteps[activeContext];
  const trial = className => <RouteLink className={className} to="/app" onNavigate={onNavigate}>Try it for free <span aria-hidden="true">↗</span></RouteLink>;
  return <div className="landing">
    <a className="skip-link" href="#landing-main">Skip to content</a>
    <header className="landing-header"><nav className="landing-nav landing-width" aria-label="Main navigation"><RouteLink className="brand-lockup" to="/" onNavigate={onNavigate} aria-label="PRism AI home"><span className="brand-mark">P</span>PRism AI</RouteLink><div className="landing-nav-links"><a href="#features">Features</a><a href="#how-it-works">How it works</a><a href="https://github.com/tarun5004/prism-ai" target="_blank" rel="noopener noreferrer">View source ↗</a><RouteLink to="/analyses" onNavigate={onNavigate}>Saved analyses</RouteLink></div>{trial('landing-cta landing-cta-small')}</nav></header>
    <main id="landing-main">
      <section className="landing-hero landing-width"><div><p className="landing-eyebrow">PULL REQUEST INTELLIGENCE</p><h1 tabIndex={-1}>Understand the change.<br /><span>Before you merge.</span></h1></div><div className="hero-copy"><p>Code changes fast.<br />Make sense of the diff, the context and the risk—with evidence you can inspect.</p>{trial('landing-cta')}<RouteLink className="sample-review-button" to="/demo" onNavigate={onNavigate}>See a sample review →</RouteLink><small>Personal demo · Bring a GitHub PR URL</small></div></section>
      <FeatureShowcase activeIndex={activeFeature} onSelect={setActiveFeature} />
      <div className="landing-capabilities landing-width"><span>Built for a clearer review</span><span>GitHub PRs</span><span>Unified diffs</span><span>Gemini + rules</span><span>Saved reports</span></div>
      <section className="landing-statement landing-width"><div className="context-lines" aria-hidden="true">{[0, 1, 2, 3, 4].map(index => <i key={index} />)}</div><div><p className="landing-eyebrow">LESS GUESSWORK. MORE CONTEXT.</p><h2>A diff shows what changed.<br />A review helps you understand why it matters.</h2><p className="landing-muted">Move from changed lines to potential impact, with clear evidence and honest limits.</p></div></section>
      <section id="features" className="landing-width landing-feature-section"><p className="landing-eyebrow">01 / REVIEW WITH EVIDENCE</p><h2>See the code. Inspect the reasoning.</h2><p className="landing-section-intro">Your diff and review belong together. Explore findings without losing the lines they refer to.</p><div className="landing-feature-grid"><div className="feature-frame"><FeaturePreview feature={features[0]} /></div><div className="feature-benefits">{features.map(feature => <article key={feature.name}><h3>{feature.tag}</h3><p>{feature.description}</p></article>)}</div></div></section>
      <section id="how-it-works" className="landing-width landing-context-section"><p className="landing-eyebrow">02 / HOW IT WORKS</p><h2>Context in. Grounded feedback out.</h2><p className="landing-section-intro">A focused review of the PR—not a claim to understand your entire repository.</p><div className="context-explorer"><div className="context-options" aria-label="Review context steps">{contextSteps.map((step, index) => <button type="button" key={step.name} aria-pressed={activeContext === index} aria-controls="context-detail" onClick={() => setActiveContext(index)}><span className="mono-label">0{index + 1}</span><strong>{step.name}</strong></button>)}</div><div id="context-detail" className="context-detail"><div className="context-pipeline" aria-label="Selected context flow">{context.nodes.map((node, index) => <div key={node}><span>0{index + 1}</span><strong>{node}</strong></div>)}</div><h3>{context.title}</h3><p>{context.description}</p><span className="preview-chip">Human review before merging</span></div></div></section>
      <section className="landing-width landing-final-cta"><div><p className="landing-eyebrow">OPEN A PULL REQUEST. GET A CLEARER PICTURE.</p><h2>Make your next review count.</h2></div>{trial('landing-cta')}</section>
    </main>
    <footer className="landing-footer landing-width"><div className="footer-links"><div><RouteLink className="brand-lockup" to="/" onNavigate={onNavigate}>PRism AI</RouteLink><p>Understand changes.<br />Review with evidence.</p></div><div><h3>Explore</h3><a href="#features">Features</a><a href="#how-it-works">How it works</a><a href="https://github.com/tarun5004/prism-ai" target="_blank" rel="noopener noreferrer">View source ↗</a><RouteLink to="/analyses" onNavigate={onNavigate}>Saved analyses</RouteLink></div><div><h3>Built with clarity</h3><p>Evidence-backed feedback</p><p>Visible context limits</p><p>AI guidance, human judgment</p></div></div><div className="footer-wordmark" aria-hidden="true">PRism AI</div><div className="footer-bottom"><span>PRism AI · Personal demo project</span><span>AI feedback is advisory. Verify before merging.</span></div></footer>
  </div>;
}

export { resolveRoute, LandingPage, FeatureShowcase };
export { EmailPreference };
export default App;
