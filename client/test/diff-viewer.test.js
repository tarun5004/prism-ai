import assert from 'node:assert/strict';
import { after, test } from 'node:test';
import { fileURLToPath } from 'node:url';
import { readFileSync } from 'node:fs';
import { createServer } from 'vite';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';

// Use the existing JSX transformer; no browser or external API is needed.
const vite = await createServer({
  root: fileURLToPath(new URL('../', import.meta.url)),
  server: { middlewareMode: true },
  appType: 'custom'
});
after(() => vite.close());
const viewer = await vite.ssrLoadModule('/src/features/dashboard/DiffViewer.jsx');
const dashboard = await vite.ssrLoadModule('/src/features/dashboard/DashboardPage.jsx');
const app = await vite.ssrLoadModule('/src/app/App.jsx');

test('queued review page explains accepted background work without claiming completed AI', () => {
  for (const pendingStage of ['queued', 'running']) {
    const html = renderToStaticMarkup(createElement(dashboard.ReviewPage, { pendingStage }));
    assert.match(html, pendingStage === 'queued' ? /Review queued/ : /Review running/);
    assert.match(html, /close this page/i);
    assert.ok(!html.includes('AI analysis completed'));
  }
});

test('provider attribution reflects the saved review and semantic retrieval status', () => {
  const html = renderToStaticMarkup(createElement(dashboard.AnalysisReport, { analysis: {
    id: 'mistral-report', status: 'completed', aiStatus: 'completed', aiProvider: 'mistral', aiModel: 'mistral-small-latest',
    pullRequest: {}, findings: [], aiCoverage: { semanticRetrieval: { status: 'completed', indexedChunks: 3, retrievedChunks: 2, cacheHit: true, embeddingCalls: 1 } }
  } }));
  assert.match(html, /Mistral/);
  assert.match(html, /mistral-small-latest/);
  assert.match(html, /Chroma/);
  assert.ok(!html.includes('Gemini returned'));
});

test('existing saved HTTP 403 reports explain provider access denial', () => {
  const html = renderToStaticMarkup(createElement(dashboard.AnalysisReport, { analysis: {
    id: 'denied-provider', status: 'completed', aiStatus: 'unavailable', aiError: 'API_ERROR',
    aiProvider: 'groq', aiDiagnostics: { httpStatus: 403 }, pullRequest: {}, findings: []
  } }));
  assert.match(html, /denied access from this deployment/);
  assert.ok(!html.includes('AI analysis completed'));
});

test('email opt-in is explicit and unavailable delivery disables the control', () => {
  const html = renderToStaticMarkup(createElement(app.EmailPreference, { session: { emailAvailable: false, emailNotifications: false } }));
  assert.match(html, /Review-ready emails/);
  assert.match(html, /disabled/);
  assert.ok(!html.includes('checked=""'));
});

test('public sample keeps evidence visible and removes all feedback writes', () => {
  const html = renderToStaticMarkup(createElement(dashboard.AnalysisReport, { analysis: {
    id: 'demo-b01', status: 'completed', pullRequest: {}, findings: [{ title: 'Owner check missing', severity: 'high', evidence: 'db.deleteNote(note.id)' }],
    sample: { readOnly: true, description: 'Recorded Gemini output on an owned synthetic fixture' }
  } }));
  assert.deepEqual(app.resolveRoute('/demo'), { page: 'demo' });
  assert.match(html, /Recorded Gemini output/);
  assert.ok(!html.includes('Optional feedback reason'));
  assert.match(html, /db.deleteNote/);
});

test('loaded report page receives the connected reviewer identity', () => {
  const html = renderToStaticMarkup(createElement(dashboard.ReviewPage, { userId: '42', analysis: {
    id: 'loaded-report', status: 'completed', pullRequest: {}, findings: [{ title: 'Potential bug', severity: 'medium' }],
    feedback: { '0_42': { verdict: 'useful', reason: 'Reviewed by account 42' } }
  } }));
  assert.match(html, /Reviewed by account 42/);
  assert.match(html, /Potential bug/);
});

test('finding feedback and provider usage are visible without overwriting evidence', () => {
  const html = renderToStaticMarkup(createElement(dashboard.AnalysisReport, { analysis: {
    id: 'feedback-ui', status: 'completed', pullRequest: {}, findings: [{ title: 'Bug', severity: 'high', evidence: 'return bad;', source: 'ai' }],
    aiDiagnostics: { usage: { inputTokens: 123, outputTokens: 45 }, inputCharacters: 456, inputBytes: 470, promptVersion: 'pr-review-v1', schemaVersion: 'review-v1', runId: 'run' }
  } }));
  assert.match(html, /Useful/);
  assert.match(html, /Incorrect/);
  assert.match(html, /Optional feedback reason/);
  assert.match(html, /123/);
  assert.match(html, /456 characters/);
  assert.match(html, /470 UTF-8 bytes/);
  assert.match(html, /return bad;/);
});

test('charcoal theme keeps text, primary actions and diff states readable', () => {
  const css = readFileSync(new URL('../src/styles.css', import.meta.url), 'utf8');
  assert.match(css, /color-scheme:\s*dark/);
  const colors = Object.fromEntries([...css.matchAll(/--([a-z-]+):\s*(#[a-f\d]{6})/gi)].map(match => [match[1], match[2]]));
  const luminance = hex => {
    assert.equal(typeof hex, 'string', 'Expected a declared theme color');
    const channels = hex.slice(1).match(/../g).map(value => parseInt(value, 16) / 255).map(value => value <= 0.04045 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4);
    return channels[0] * 0.2126 + channels[1] * 0.7152 + channels[2] * 0.0722;
  };
  for (const [foreground, background] of [['ink', 'surface'], ['muted', 'page-bg'], ['surface', 'accent'], ['success', 'success-soft'], ['danger', 'danger-soft'], ['warning', 'warning-soft']]) {
    const values = [luminance(colors[foreground]), luminance(colors[background])].sort((a, b) => b - a);
    assert.ok((values[0] + 0.05) / (values[1] + 0.05) >= 4.5, `${foreground}/${background} needs readable contrast`);
  }
});

test('resolves separate page URLs and rejects invalid report paths', () => {
  assert.deepEqual(app.resolveRoute('/'), { page: 'landing' });
  assert.deepEqual(app.resolveRoute('/app'), { page: 'overview' });
  assert.deepEqual(app.resolveRoute('/analyses/'), { page: 'analyses' });
  assert.deepEqual(app.resolveRoute('/analyses/legacy-1'), { page: 'review', analysisId: 'legacy-1' });
  for (const path of ['/unknown', '/analyses/a/extra', '/analyses/%', '/analyses/a%2Fb']) assert.equal(app.resolveRoute(path).page, 'not-found');
});

test('introduction presents working features and routes every trial CTA into the workspace', () => {
  const html = renderToStaticMarkup(createElement(app.LandingPage));
  assert.match(html, /Understand the change/);
  assert.match(html, /Illustrative preview/);
  assert.match(html, /AI feedback is advisory/);
  assert.match(html, /class="footer-wordmark"/);
  assert.equal((html.match(/Try it for free/g) || []).length, 3);
  assert.equal((html.match(/href="\/app"/g) || []).length, 3);
  assert.ok(!html.includes('pull-request-url'));
  assert.ok(!html.includes('Trusted by'));
  const entry = renderToStaticMarkup(createElement(app.default));
  assert.ok(!entry.includes('pull-request-url'), 'Initial landing must not mount the workspace');
  assert.ok(!entry.includes('dashboard-shell'));
});

test('home offers GitHub connection in its main content and a review entry after login', () => {
  const guest = renderToStaticMarkup(createElement(app.LandingPage, { session: { enabled: true, authenticated: false, installUrl: 'https://github.com/apps/prism/installations/new' } }));
  assert.match(guest, /id="home-workspace"/);
  assert.match(guest, /href="\/api\/github\/login"/);
  assert.match(guest, /Connect GitHub/);
  assert.match(guest, /Install on GitHub/);
  const connected = renderToStaticMarkup(createElement(app.LandingPage, { session: { enabled: true, authenticated: true, login: 'reviewer' } }));
  assert.match(connected, /Connected as reviewer/);
  assert.match(connected, /Start a review/);
  assert.match(connected, /Saved analyses/);
});

test('home explains core review capabilities without advertising optional RAG as hosted', () => {
  const html = renderToStaticMarkup(createElement(app.LandingPage));
  for (const feature of ['Bounded code context', 'Evidence at the line', 'Summary &amp; walkthrough', 'Incremental revisions', 'Feedback memory', 'Semantic retrieval']) {
    assert.ok(html.includes(feature), `Missing capability: ${feature}`);
  }
  assert.match(html, /Optional integrations/);
  assert.match(html, /not enabled on this hosted demo/);
  assert.match(html, /persistent Chroma/);
  assert.ok(!html.includes('understands your entire repository'));
});

test('home onboarding distinguishes app installation, authorization, submission and saved reports', () => {
  const html = renderToStaticMarkup(createElement(app.LandingPage));
  for (const step of ['Install the GitHub App', 'Connect your account', 'Open or submit a PR', 'Inspect the saved report']) {
    assert.ok(html.includes(step), `Missing usage step: ${step}`);
  }
  assert.match(html, /id="getting-started"/);
});

test('home cloud story keeps queue before worker and distinguishes external AI and storage', () => {
  const html = renderToStaticMarkup(createElement(app.LandingPage));
  assert.match(html, /id="architecture"/);
  assert.match(html, /Azure Storage Queue/);
  assert.match(html, /Container Apps Job/);
  assert.match(html, /MongoDB Atlas/);
  assert.match(html, /External services/);
  assert.match(html, /idle cooldown target/);
  assert.ok(html.indexOf('Azure Storage Queue') < html.indexOf('Container Apps Job'));
});

test('home cold-start guidance offers recovery without promising automatic webhook retries', () => {
  const html = renderToStaticMarkup(createElement(app.LandingPage));
  assert.match(html, /GitHub does not automatically retry failed webhook deliveries/);
  assert.match(html, /redeliver/);
  assert.match(html, /Analyze PR/);
  assert.match(html, /not a billing cap/);
});

test('internal home navigation avoids reload and preserves modified-click behavior', () => {
  const destinations = [];
  const link = dashboard.RouteLink({ to: '/', onNavigate: path => destinations.push(path), children: 'Home' });
  let prevented = false;
  const event = { button: 0, currentTarget: {}, preventDefault() { prevented = true; } };
  link.props.onClick(event);
  assert.equal(prevented, true);
  assert.deepEqual(destinations, ['/']);
  prevented = false;
  link.props.onClick({ ...event, ctrlKey: true });
  assert.equal(prevented, false);
  assert.equal(destinations.length, 1);
});

test('feature cards open on pointer hover, keyboard focus and touch click', () => {
  const selected = [];
  const tree = app.FeatureShowcase({ activeIndex: 0, onSelect: index => selected.push(index) });
  const cards = tree.props.children;
  assert.equal(cards.length, 4);
  cards[2].props.onPointerEnter({ pointerType: 'mouse' });
  cards[1].props.onPointerEnter({ pointerType: 'touch' });
  cards[2].props.children[0].props.onFocus();
  cards[3].props.children[0].props.onClick();
  assert.deepEqual(selected, [2, 2, 3]);
  const html = renderToStaticMarkup(createElement(app.FeatureShowcase, { activeIndex: 2, onSelect() {} }));
  assert.equal((html.match(/aria-expanded="true"/g) || []).length, 1);
  assert.match(html, /id="feature-card-2" aria-hidden="false"/);
  assert.equal((html.match(/aria-hidden="true" inert=""/g) || []).length, 3);
});

test('landing links to the actual configured source repository', () => {
  const html = renderToStaticMarkup(createElement(app.LandingPage));
  assert.match(html, /href="https:\/\/github.com\/tarun5004\/prism-ai"/);
  assert.match(html, /View source/);
});

test('renders only the active page instead of stacking overview, history and report', () => {
  const overview = renderToStaticMarkup(createElement(dashboard.default, { route: { page: 'overview' } }));
  assert.match(overview, /Open a pull request/);
  assert.ok(!overview.includes('Recent analyses'));
  assert.ok(!overview.includes('review-workbench'));
  const history = renderToStaticMarkup(createElement(dashboard.default, { route: { page: 'analyses' } }));
  assert.match(history, /Saved analyses/);
  assert.ok(!history.includes('id="pull-request-url"'));
  assert.ok(!history.includes('review-workbench'));
  const report = renderToStaticMarkup(createElement(dashboard.default, { route: { page: 'review', analysisId: 'direct-link' } }));
  assert.match(report, /Loading saved report/);
  assert.ok(!report.includes('id="pull-request-url"'));
  assert.ok(!report.includes('Recent analyses'));
});

test('report page has an actionable missing-report state and history uses real links', () => {
  const html = renderToStaticMarkup(createElement(dashboard.ReviewPage, { error: 'Analysis not found.', onRetry() {}, onNavigate() {} }));
  assert.match(html, /Analysis not found/);
  assert.match(html, /Try again/);
  assert.match(html, /href="\/analyses"/);
  const history = renderToStaticMarkup(createElement(dashboard.AnalysesPage, { reports: [{ id: 'legacy-1', status: 'completed', pullRequest: { title: 'Saved PR' } }], status: 'ready', onNavigate() {} }));
  assert.match(history, /href="\/analyses\/legacy-1"/);
});

test('progress panel marks only stages preceding the actual backend stage as done', () => {
  const html = renderToStaticMarkup(createElement(dashboard.AnalysisProgress, { stage: 'context', elapsedSeconds: 17, visitedStages: ['fetching', 'context'] }));
  assert.match(html, /Building review context/);
  assert.match(html, /aria-current="step"/);
  assert.match(html, /17s elapsed/);
  assert.match(html, /Your context is being read/);
  assert.equal((html.match(/data-state="complete"/g) || []).length, 1);
  assert.equal((html.match(/data-state="pending"/g) || []).length, 2);
  assert.ok(!html.includes('%'));
});

test('progress never marks skipped context or AI work as completed', () => {
  const html = renderToStaticMarkup(createElement(dashboard.AnalysisProgress, { stage: 'saving', elapsedSeconds: 2, visitedStages: ['fetching', 'saving'] }));
  assert.equal((html.match(/data-state="complete"/g) || []).length, 1);
  assert.equal((html.match(/data-state="skipped"/g) || []).length, 2);
  assert.match(html, /Reviewing with AI · skipped/);
});

test('workspace places the diff beside accessible overview and findings controls', () => {
  const html = renderToStaticMarkup(createElement(dashboard.AnalysisReport, { analysis: { id: 'workspace', status: 'completed', pullRequest: { title: 'Example PR', changedFiles: [] }, findings: [] } }));
  assert.match(html, /class="review-workbench"/);
  assert.match(html, /aria-label="Review views"/);
  assert.match(html, /aria-pressed="true"[^>]*>Overview/);
  assert.match(html, /Findings/);
  assert.match(html, /aria-label="Review panel"/);
  assert.match(html, /No contextual AI review is available/);
  assert.match(html, /Changed files/);
});

test('renders contextual AI review, referenced impacts and advisory merge guidance', () => {
  const reference = { filePath: 'a.js', lineSide: 'old', lineNumber: 5, evidence: 'guard();' };
  const html = renderToStaticMarkup(createElement(dashboard.AnalysisReport, { analysis: {
    id: 'context', status: 'completed', aiStatus: 'partial', pullRequest: { changedFiles: [{ path: 'a.js', patch: '@@ -5 +4,0 @@\n-guard();', additions: 0, deletions: 1 }] }, findings: [],
    aiReview: { summary: 'Removes a guard.', recommendation: 'insufficient_context', walkthrough: [{ filePath: 'a.js', description: 'Guard removed.', evidenceRefs: [reference] }], impacts: [{ description: 'Invalid users may reach the handler.', evidenceRefs: [reference] }], limitations: ['Callers were not supplied.'] }
  } }));
  assert.match(html, /Removes a guard/);
  assert.match(html, /Potential impact/);
  assert.match(html, /More context needed/);
  assert.match(html, /View old line 5/);
  assert.match(html, /Callers were not supplied/);
});

test('resolves old-side locations without confusing a same-number new line', () => {
  const files = [{ path: 'a.js', patch: '@@ -5 +5 @@\n-old\n+new' }];
  assert.equal(viewer.findDiffLocation(files, { filePath: 'a.js', lineSide: 'old', lineNumber: 5 }).text, 'old');
  assert.equal(viewer.findDiffLocation(files, { filePath: 'a.js', lineSide: 'invalid', lineNumber: 5 }), null);
});

test('reopened failure uses safe error-code guidance and hides unknown raw errors', () => {
  const report = { id: 'failed', status: 'failed', pullRequest: {}, findings: [], errorCode: 'REVISION_CHANGED', error: 'private raw upstream data' };
  const html = renderToStaticMarkup(createElement(dashboard.AnalysisReport, { analysis: report }));
  assert.match(html, /revision changed/);
  assert.ok(!html.includes('private raw upstream data'));
});

test('report renders advisory AI failure, coverage, revision and safe evidence', () => {
  const html = renderToStaticMarkup(createElement(dashboard.AnalysisReport, { analysis: {
    id: 'fixture', status: 'completed', aiStatus: 'unavailable', aiError: 'API_ERROR',
    createdAt: '2026-10-31T00:00:00Z', aiDiagnostics: { httpStatus: 504, durationMs: 1500, attempts: 1 },
    pullRequest: { headSha: '1234567890', headBranch: 'fix', baseSha: 'abcdef1234', baseBranch: 'main', filesComplete: false, totalChangedFiles: 2,
      changedFiles: [{ path: 'a.js', patch: '@@ -0,0 +1 @@\n+<script>unsafe</script>', additions: 1, deletions: 0 }] },
    findings: [{ source: 'ai', title: 'Check output', severity: 'high', filePath: 'a.js', lineNumber: 1, evidence: '<script>unsafe</script>', explanation: 'Example', suggestedFix: 'Escape output' }]
  } }));
  assert.match(html, /Rule-based analysis completed/);
  assert.match(html, /AI analysis unavailable/);
  assert.match(html, /processing deadline/);
  assert.match(html, /File retrieval is incomplete/);
  assert.match(html, /12345678/);
  assert.match(html, /View new line 1 in diff/);
  assert.match(html, /&lt;script&gt;unsafe&lt;\/script&gt;/);
  assert.ok(!html.includes('<script>unsafe</script>'));
  assert.ok(!html.includes('AI analysis completed'));
});

test('old saved reports without revision or AI metadata still render', () => {
  const html = renderToStaticMarkup(createElement(dashboard.AnalysisReport, { analysis: { id: '1', status: 'completed', createdAt: 'invalid', pullRequest: {}, findings: [] } }));
  assert.match(html, /Revision not recorded/);
  assert.match(html, /AI status not recorded/);
  assert.match(html, /No changed files/);
  assert.match(html, /Date unavailable/);
});

test('diff initial focus selects the actual target file and highlights its row', () => {
  const html = renderToStaticMarkup(createElement(viewer.default, {
    files: [{ path: 'first.js', patch: '' }, { path: 'target.js', previousPath: 'old.js', patch: '@@ -0,0 +10 @@\n+target();', additions: 1, deletions: 0 }],
    focusLocation: { filePath: 'target.js', lineNumber: 10 }
  }));
  assert.match(html, /Renamed from/);
  assert.match(html, /diff-line-focused/);
  assert.match(html, /Diff for target.js/);
});

test('finding navigation resolves only existing new-side lines', () => {
  const files = [{ path: 'a.js', patch: '@@ -5 +10 @@\n-old\n+new' }];
  assert.equal(viewer.findDiffLocation(files, { filePath: 'a.js', lineNumber: 10 }).text, 'new');
  for (const finding of [
    { filePath: 'missing.js', lineNumber: 10 },
    { filePath: 'a.js', lineNumber: 5 },
    { filePath: 'a.js', lineNumber: '10' },
    { filePath: 'a.js', lineNumber: 0 }
  ]) assert.equal(viewer.findDiffLocation(files, finding), null);
});

test('unsafe hunk coordinates remain unnumbered', () => {
  const result = viewer.parseUnifiedDiff('@@ -9007199254740992 +1 @@\n-old\n+new');
  assert.equal(result.incomplete, true);
  assert.ok(result.lines.every(line => line.oldNumber === null && line.newNumber === null));
});

test('numbers replacements and context using both hunk ranges', () => {
  assert.equal(typeof viewer.parseUnifiedDiff, 'function');
  const result = viewer.parseUnifiedDiff('@@ -10,3 +20,4 @@ function\n before\n-old\n+new\n+extra\n after');
  assert.deepEqual(result.lines.slice(1), [
    { kind: 'context', oldNumber: 10, newNumber: 20, text: 'before' },
    { kind: 'deleted', oldNumber: 11, newNumber: null, text: 'old' },
    { kind: 'added', oldNumber: null, newNumber: 21, text: 'new' },
    { kind: 'added', oldNumber: null, newNumber: 22, text: 'extra' },
    { kind: 'context', oldNumber: 12, newNumber: 23, text: 'after' }
  ]);
  assert.equal(result.incomplete, false);
});

test('resets counters for multiple hunks and omitted counts', () => {
  const result = viewer.parseUnifiedDiff('@@ -1 +1 @@\n-old\n+new\n@@ -100 +200 @@\n-x\n+y');
  assert.equal(result.lines[4].oldNumber, 100);
  assert.equal(result.lines[5].newNumber, 200);
  assert.equal(result.incomplete, false);
});

test('handles added and deleted files with zero-length ranges', () => {
  const added = viewer.parseUnifiedDiff('@@ -0,0 +1,2 @@\n+one\n+two\n');
  assert.deepEqual(added.lines.slice(1).map((line) => [line.oldNumber, line.newNumber]), [[null, 1], [null, 2]]);
  const deleted = viewer.parseUnifiedDiff('@@ -1,2 +0,0 @@\n-one\n-two');
  assert.deepEqual(deleted.lines.slice(1).map((line) => [line.oldNumber, line.newNumber]), [[1, null], [2, null]]);
  assert.equal(added.incomplete || deleted.incomplete, false);
});

test('keeps metadata unnumbered without mistaking source prefixes for headers', () => {
  const result = viewer.parseUnifiedDiff('--- a/file\n+++ b/file\n@@ -1 +1 @@\n---old\n\\ No newline at end of file\n+++new\n\\ No newline at end of file');
  assert.equal(result.lines[0].oldNumber, null);
  assert.equal(result.lines[1].newNumber, null);
  assert.deepEqual(result.lines[3], { kind: 'deleted', oldNumber: 1, newNumber: null, text: '--old' });
  assert.deepEqual(result.lines[5], { kind: 'added', oldNumber: null, newNumber: 1, text: '++new' });
  assert.equal(result.incomplete, false);
});

test('flags incomplete hunks, including before a later complete hunk', () => {
  assert.equal(viewer.parseUnifiedDiff('@@ -1,2 +1,2 @@\n one').incomplete, true);
  assert.equal(viewer.parseUnifiedDiff('@@ -1,2 +1,2 @@\n one\n@@ -10 +10 @@\n two').incomplete, true);
});

test('never assigns guessed numbers after malformed or overlong hunk data', () => {
  const overlong = viewer.parseUnifiedDiff('@@ -1 +1 @@\n valid\n extra\n+more');
  assert.equal(overlong.incomplete, true);
  assert.equal(overlong.lines[2].oldNumber, null);
  assert.equal(overlong.lines[3].newNumber, null);
  const malformed = viewer.parseUnifiedDiff('@@ broken @@\n+unknown');
  assert.equal(malformed.incomplete, true);
  assert.equal(malformed.lines[1].newNumber, null);
});

test('preserves whitespace, blank code lines and CRLF without inventing hunks', () => {
  const result = viewer.parseUnifiedDiff('@@ -1 +1,2 @@\r\n \t  \r\n+\r\n');
  assert.equal(result.lines[1].text, '\t  ');
  assert.equal(result.lines[2].text, '');
  assert.equal(result.incomplete, false);
  assert.equal(viewer.parseUnifiedDiff('raw patch content').hasHunks, false);
  assert.equal(viewer.parseUnifiedDiff('').lines.length, 0);
});

// The homepage preview must remain a safe, local interaction.
test('home provides an illustrative keyboard-accessible evidence explorer', () => {
  const html = renderToStaticMarkup(createElement(app.LandingPage));
  assert.match(html, /aria-label="Example review findings"/);
  assert.match(html, /data-highlighted="true"/);
  assert.match(html, /No API calls/);
});

test('home explains bounded context, optional semantic retrieval and evidence validation concretely', () => {
  const html = renderToStaticMarkup(createElement(app.LandingPage));
  assert.match(html, /id="context-pipeline"/);
  for (const phrase of ['Context engineering', '32-line', '16 chunks', '4 results', 'Evidence validation', 'LangGraph']) assert.ok(html.includes(phrase), phrase);
});

test('home distinguishes configured GitLab checks from gated GitHub deployment', () => {
  const html = renderToStaticMarkup(createElement(app.LandingPage));
  for (const phrase of ['GitLab CI', 'GitHub Actions', 'Manual deployment gate', 'does not automatically sync', 'runner verification']) assert.ok(html.includes(phrase), phrase);
  assert.ok(!html.includes('Every GitHub push automatically deploys'));
});

test('home mascot has an explicit keyboard and touch interaction', () => {
  const html = renderToStaticMarkup(createElement(app.LandingPage));
  assert.match(html, /aria-label="Say hello to Pip"/);
  assert.match(html, /robot-head/);
  assert.match(html, /data-greeting="false"/);
});

test('home exposes integrations without a collapsed disclosure and removes the old mascot controls', () => {
  const html = renderToStaticMarkup(createElement(app.LandingPage));
  assert.match(html, /id="optional-integrations"/);
  assert.ok(!html.includes('details class="optional-integrations"'));
  assert.ok(!html.includes('Pause motion'));
  assert.ok(!html.includes('class="scene-controls"'));
  assert.match(html, /aria-label="Pip thought experiments"/);
});

test('architecture is an explicitly illustrative request with persistence before enqueue', () => {
  const html = renderToStaticMarkup(createElement(app.LandingPage));
  assert.match(html, /aria-label="Request checkpoints"/);
  assert.match(html, /Illustrative request.*not live telemetry/);
  assert.match(html, /Replay request/);
  assert.ok(html.indexOf('Persist job') < html.indexOf('Azure Storage Queue'));
  assert.match(html, /Gemini inference/);
});

test('delivery stages expose an accessible local explorer with artifact and gate details', () => {
  const html = renderToStaticMarkup(createElement(app.LandingPage));
  assert.match(html, /aria-label="Explore workflow stages"/);
  assert.match(html, /aria-controls="delivery-stage-detail"/);
  assert.match(html, /Illustrative workflow.*does not run CI/);
  assert.match(html, /WHAT THIS STAGE PRODUCES/);
  assert.match(html, /WHAT CAN STOP IT/);
});

test('footer offers product perspectives without changing the review entry destination', () => {
  const html = renderToStaticMarkup(createElement(app.LandingPage));
  assert.match(html, /aria-label="Choose a closing perspective"/);
  assert.match(html, /aria-controls="closing-perspective"/);
  assert.match(html, /id="closing-perspective"/);
  assert.equal((html.match(/Try it for free/g) || []).length, 3);
  assert.match(html, /Recorded review/);
});

test('homepage accent ink remains readable on both active and soft palette surfaces', () => {
  const css = readFileSync(new URL('../src/features/landing/styles/interaction-palette.css', import.meta.url), 'utf8');
  const colors = Object.fromEntries([...css.matchAll(/--([a-z-]+):\s*(#[a-f\d]{6})/gi)].map(match => [match[1], match[2]]));
  const luminance = hex => {
    const channels = hex.slice(1).match(/../g).map(value => parseInt(value, 16) / 255).map(value => value <= 0.04045 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4);
    return channels[0] * 0.2126 + channels[1] * 0.7152 + channels[2] * 0.0722;
  };
  for (const hue of ['coral', 'green', 'yellow', 'blue', 'orange', 'lilac']) {
    for (const surface of ['accent', 'soft']) {
      const values = [luminance(colors[`ink-${hue}`]), luminance(colors[`${surface}-${hue}`])].sort((a, b) => b - a);
      assert.ok((values[0] + 0.05) / (values[1] + 0.05) >= 4.5, `${hue} ink on ${surface} needs readable contrast`);
    }
  }
});
