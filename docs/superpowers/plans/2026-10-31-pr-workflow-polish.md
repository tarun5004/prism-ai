# PR workflow polish implementation plan

## 2026-11-02 — approved E1 evaluation and zero-cost constraint

Execute E1 inline in small commits. No deployment purchase, infrastructure subscription, dependency install or live provider request in this slice. Prefer free/student-eligible deployment later; eligibility, expiry, sleep limits and provider API costs must be checked before selecting a host. An existing subscription is not evidence of API credit entitlement. Do not claim a free public deployment yet.

- [x] Dataset/scorer: 16 original synthetic before/after cases (12 development, 4 held-out), known bugs and clean/incomplete-context/adversarial examples. Versioned JSON fixture; Python stdlib scorer/test file. Correct finding matches need explicit human adjudication plus source/evidence/location checks; no keyword-based semantic accuracy claim. Metrics use all selected cases, account for missing/failed runs, reject duplicate IDs/invalid labels and represent undefined rates as null. Fix existing FPR terminology. Test before code, review and commit.
- [x] Collector: one Node CLI script reusing prepareAiInput/runAiAnalysis, dry-run by default, explicit --live plus case/split required for spending. No GitHub fetch, production workflow changes, DB writes, retry or labels in model input. Freeze dataset/source hashes and model/config/run metadata. Refuse overwriting artifacts, save each case incrementally and keep failure records. Add native Node checks; commit.
- [x] Verify offline scorer/collector and one dry-run artifact roundtrip, independent review, update roadmap/README with exact scope and next live-run step. Keep artifacts outside tracked source. Preserve user changes, main and existing behavior; integrate backend chunks without merging main.

Verified: 95 backend offline tests, 7 Python stdlib metric tests, Node syntax and dry-run artifact/scorer roundtrip passed. Synthetic tests cover wrong/missed/duplicate findings, invalid evidence, failed/missing cases, stale hashes, held-out separation, no label leakage, explicit live spending controls and atomic replacement failure. Initial CLI roundtrip printing used a Unicode arrow unsupported by the host console; ASCII-only verification output fixed that test harness issue. Independent review caught in-place artifact writes; switched to synced same-directory temporary-file rename and confirmed prior artifacts survive failed replacement. No live model score, new dependency, production workflow change or hosting spend. Chunks: 692357f (fixtures/scorer), 1f0b648 (collector), 339eace (durability fix).

Ruling: human judgments are required for semantic precision/recall; file/line matching alone rewards unrelated findings. Unreviewed delivered findings suppress headline quality rates. A dry-run measures wiring only, never Gemini quality. New files are limited to fixture, Python scorer/test, Node collector/test: each has a distinct job; no application service or UI is needed.

## 2026-11-01 — approved GitHub PR webhook

Implement inline in verified chunks, not a new platform. Repo-scoped webhook for opened/synchronize/reopened/ready_for_review, skip drafts/closed PRs. Verify raw-body SHA256 HMAC before JSON processing; require server secret + one repository allowlist. Respond promptly, then run existing pipeline in the same long-lived Node process. No GitHub comments or auto-merge.

- [x] Extract existing pipeline unchanged into analysis.service.js; controller preserves JSON/NDJSON contracts. Add expected revision guard before AI and optional trigger provenance to existing model. Run targeted existing tests, commit.
- [x] Add one focused pullRequest.webhook.js receiver/dispatch module and existing-app raw route before JSON middleware. Deterministic report ID hashes repository/PR/base/head; in-flight set prevents concurrent duplicate calls; existing repository lookup suppresses persisted duplicates across restarts. Bound active jobs to two, return busy rather than silently accepting excess. Persist final success/failure and safe structured completion logs. Test signed local HTTP, rejects, ignored events, duplicate races, revision mismatch and failures; commit.
- [x] Configure placeholders/local secret without printing/staging secrets. README tunnel/setup/delivery/results walkthrough. Full backend offline checks, syntax/health, frontend build, independent review and integration. No live GitHub/Gemini calls needed.

Verification: 9 targeted compatibility checks and 3 schema/revision checks passed after extraction. Receiver test failed before implementation; 6 signed-event tests subsequently passed. Full backend suite passed 91/91 once; changed backend modules passed node --check; actual local HTTP health/manual validation passed; frontend production build passed. Isolated temporary MongoDB roundtrip retained webhook provenance/patches and suppressed persisted redelivery with a fresh handler; temporary database was removed after exact name validation. Independent review found no critical/important issues. Local secret was generated/preserved in ignored server/.env without printing it. Only new placeholder lines were staged from .env.example; original user AI_API_URL change remains unstaged. No live GitHub/Gemini calls or remote webhook registration. Public path-restricted HTTPS URL and repository webhook activation remain operator setup; README documents both and end-to-end live verification. Chunks: 6c83e9b (shared pipeline), 05db2d7 (secure dispatch).

Ruling: use in-process dispatch rather than queue/worker infrastructure for this single-user demo; acceptance is not crash-durable. Lost events need manual GitHub redelivery; persisted final reports remain deduplicated when MongoDB is connected. One Node process only. Busy responses also need redelivery. New files are only shared analysis service, focused webhook module and its native test file. Do not overwrite/stage user .env.example/rule changes or modify main.

## 2026-11-01 — subtle card depth and real saved sample

Completed in existing files: layered card shadows, perspective tilt and selected-card lift; mobile/reduced-motion disable transforms. Hero sample button lazily calls the existing history API, selects a completed report with a safe route ID (preferring contextual AI review), then navigates to its saved report. Loading disables duplicate clicks; empty/error states remain actionable through the existing trial button; unmount aborts the pending read. No automatic generation, hardcoded report IDs, new endpoints/files/dependencies or backend edits.

Verification: sample-selection check failed before implementation; 33 frontend checks passed afterward, including completed/failed reports, AI preference, malformed IDs, empty history and network failure. Production build passed. Read-only local sample selection and retrieval succeeded against an actual saved report with partial AI status. No GitHub/Gemini calls. Visual 3D/interaction QA remains unverified without an available browser surface. Self-review checked request cleanup, duplicate guard and truthful saved-report status.

## 2026-11-01 — hover-expanding hero cards and source link

Completed focused follow-up in existing App.jsx/styles.css/tests: each feature owns a bordered card and preview; mouse/pen entry, keyboard focus or touch click selects it. Flex-width transitions on desktop and collapsible rows on narrow screens respect existing reduced-motion rules. Collapsed previews are inert and excluded from the accessibility tree; native trigger buttons remain reachable. Navbar/footer source links use the verified local origin remote `https://github.com/tarun5004/prism-ai` (repository availability was not queried).

New interaction/source-link checks failed before implementation; all 32 frontend checks and production build passed afterward. Self-review checked controlled state, unique panel IDs, touch fallback, safe external links and removal of obsolete showcase styles. No new files, dependencies, backend changes or external API calls. Actual browser animation/visual QA remains unverified because no browser surface is available. Extra UI suggestions are deferred to the user.

## 2026-11-01 — approved dark introduction page

User approved implementation after reference analysis. Use PRism AI branding, charcoal/orange styling and existing local fonts. Screenshots were captured at 60–70% zoom: use readable fluid sizing at normal zoom, not screenshot-sized text. Landing at `/`, workspace at `/app`, history/report URLs unchanged. No invented customers, review metrics, login, webhook or MCP claims. Keep running workspace state while visiting the introduction. No new application files or dependencies are needed.

- [x] Chunk 1: extend App.jsx with isolated landing components, real internal CTA links, interactive feature preview, context explanation and oversized outlined/masked PRism AI footer. Update DashboardPage workspace links; extend existing render/route tests, observe failure then pass, commit on frontend branch.
- [x] Chunk 2: replace theme variables with accessible charcoal/orange colors; add scoped landing layout, responsive grids, restrained transitions and reduced-motion support in styles.css. Update contrast checks and UI_DIRECTION.md; verify targeted tests/build, commit.
- [x] Integrate, review, verify direct production-preview routes. Browser visual/interaction QA only if a surface is available. Preserve existing user configuration and rule files; do not call GitHub/Gemini.

Review focus: hidden workspace must retain active request state; landing must not start history requests before entering workspace; modified clicks remain normal links; no fabricated live data; narrow-screen content must wrap; footer must fit viewport width.


Verified: 30 frontend checks passed; latest production build passed. Local production preview served /, /app, /analyses and a report deep link; built JS/CSS and both local fonts returned successfully. No external API calls or backend edits. Independent review caught plain landing home anchors causing a full reload; fixed them with shared RouteLink and retained the last workspace route to keep report controls mounted. Reviewer confirmed no remaining important findings. Browser inventory is empty, so visual fidelity, normal-zoom fit and real browser selector/Back-Forward interaction remain unverified. Main and user configuration/rule files preserved. Chunks: 1d3687f (landing/routes), 43caff6 (dark theme), 6e4149c (navigation state fix).

## 2026-11-01 — approved page routing and light theme

Reuse existing App.jsx, DashboardPage.jsx, styles.css and render tests. No new packages, application files, backend changes, webhook or MCP work.

- [x] Routing chunk: native history paths `/` (new review), `/analyses` (history), `/analyses/:id` (saved report), explicit not-found page; separate page components in the existing dashboard module. Preserve browser Back/Forward, modified link clicks, refresh/deep links, legacy history hash, loading/errors/retry, live progress and saved-report navigation. Tests first, targeted verification, frontend commit.
- [x] Theme chunk: CodeRabbit-inspired light ivory/white surfaces, ink text, orange primary accent, distinct green/red diff colors and readable semantic risk/status colors. Keep existing local fonts. Replace existing palette, do not accumulate a second theme/override system. Verify stylesheet/render checks, commit separately.
- [x] Integrate and independently review; frontend checks, production build, production-preview deep-link HTTP checks and actual saved-report render. No model calls are necessary for this frontend-only change. Browser interaction QA only if a connector is available.

Verified: 28/28 existing native frontend checks passed, including new route resolution, isolated-page markup, actionable report errors and semantic color contrast checks. Frontend production build passed. Vite production preview returned the SPA for `/`, `/analyses`, a saved-report deep link and an unknown URL. Read-only local API data rendered as separate history, review/diff and new-review pages. Independent review found no critical/important issues. `git diff --check` passed; main remains at `844a30059c1fb797de2b7e5b0bce3e4e51e6485c`. No backend edits, packages, new application files or external API calls.

Task memory: an initial JSX extraction matched an effect cleanup return instead of the component return; the JSX transformer caught it, and extraction was corrected before the routing commit. Routing and contrast checks were observed failing before their implementation and passing afterward. No browser surface is available, so interactive Back/Forward, retry timing and visual/responsive QA remain unverified. Production hosting must rewrite client routes to `index.html`. Frontend chunks: `f25205b` (routing), `53780e7` (theme); integration merge: `81662f5`.

Task memory: native routing must not fetch a missing/malformed ID; show only the active page. Do not display a cached different report while a deep link loads. Do not reset/lose an active review when switching pages. Existing uncommitted user configuration/rule files stay untouched and unstaged. Main remains unchanged.

## 2026-11-01 — approved UI workspace and live progress

This existing document is the task ledger requested by the user. No temporary database, new application files, packages, webhook or MCP work is needed for these two features.

**Design:** Keep graphite/lime, Inter/JetBrains Mono and existing evidence rendering. Use a compact application header, report/revision summary and a desktop workspace with file navigation + unified diff beside an overview/findings review panel. Stack panels on smaller screens. Keep history, filters, old/new evidence navigation and honest AI status accessible.

**Progress contract:** Existing POST /api/analyses keeps its JSON behavior. Opt-in Accept: application/x-ndjson emits newline-separated progress frames {type:'progress',stage:'fetching'|'context'|'reviewing'|'saving'}, followed by exactly one {type:'result',report} or {type:'error',message}. Stages reflect actual boundaries; final report retains separate AI status. No timer-driven stages, guessed percentages, queues, new endpoints or automatic retries. Elapsed time is informational only. Interrupted streams produce an error, never a second generation request.

- [x] UI chunk: extend DashboardPage.jsx, DiffViewer.jsx/styles.css and existing render tests; verify and commit on feature/v0-frontend.
- [x] Backend chunk: opt-in progress framing in existing analysis.controller.js; extend existing controller tests for ordering, errors, persistence and disconnected clients; verify and commit on feature/v0-backend.
- [x] Client chunk: incremental UTF-8 stream parsing in analysis.api.js; progress/elapsed UI in DashboardPage.jsx with cleanup; existing API/render tests for split frames, failures and honest statuses; verify and commit on feature/v0-frontend.
- [x] Integrate, independent review, full relevant offline checks, production build and one real streamed review if service available. Record observed states; browser QA depends on available connector.

**Known history / guardrails:** User changes to server/.env.example, AGENT.md and RULE.md must remain unstaged. Branch switches can be rejected by the local example-file change: advance a clean temporary worktree then switch only after target config matches; never stash/reset. Gemini 3.8 previously returned 503/504 on minimal input; configured 3.6 has produced a valid partial review. 14 seconds was one observation, not a promised response time. Raw retrieved context stays transient; store only validated evidence and coverage. Main must remain unchanged.

## Approved continuation — contextual AI review

Use existing modules only; no new application files or dependencies. Preserve existing user changes and main. Implement inline, test and commit each chunk separately.

1. Deadline: 120000ms default/configuration; keep one attempt and safe diagnostics. Test SDK deadline header offline before committing.
2. Context: PR intent, changed-line-centered windows, old/new evidence; fetch at most five changed JS/TS source files and three direct relative imports pinned to SHA. Bound response bytes and context budget; record omissions honestly. No clone, execution, graph service or repository-wide claims.
3. Review: extend existing structured response with summary, referenced walkthrough/impacts, limitations; validate evidence against supplied source. Persist only validated review; derive advisory recommendation from validated findings and coverage. Preserve legacy findings-only compatibility for saved reports.
4. UI: show review, coverage and recommendation; support deleted-line navigation; display allowlisted saved failure guidance. Targeted offline rendering/parser tests and production build.
5. Verification: merge feature branches to integration; backend tests, isolated Mongo persistence, health; one controlled real PR review attempt without retries. Inspect actual request result and record limitations. Browser QA only if a browser connector is available.

Review focus: unavailable imports, secrets in retrieved code/PR intent, oversized content, incomplete/removed-only patches, fabricated review references, provider failures, legacy reports and unknown historical errors.

> Execute inline with executing-plans, one verified chunk at a time.

**Goal:** Finish existing PR reports before adding PR-context or repository modes.
**Architecture:** Extend the existing GitHub service and append-only report repository; retain the current API shape and add revision/coverage metadata. Reuse DashboardPage and DiffViewer for navigation and states.
**Stack:** Existing Express/Mongoose/React/Vite, native Node tests; no new dependencies.
**Spec:** User-approved scope in this conversation and root RULE.md.

## Constraints and review focus
- Preserve user files and main; backend/frontend commits remain separate.
- No live GitHub or Gemini requests, no automatic retries.
- Check pagination limits, missing patches, restart-safe history, stale UI requests and missing diff locations.
- Old reports must continue to open without revision metadata.

## Task 1 — Report reliability (backend)
- [x] Add offline regressions for pagination, revision/rename retention, safe upstream failures, invalid input and IDs across controller reloads.
- [x] Run targeted tests RED, then implement in pullRequest.service.js, analysis.controller.js and analysis.repository.js.
- [x] Preserve patch strings; paginate up to GitHub's 3000-file limit, flag incomplete retrieval, record base/head SHAs and previous paths. Bound upstream request time and sanitize errors.
- [x] Use randomUUID report IDs and insert rather than upsert, preserving legacy reads.
- [x] Run backend offline suite; review and commit on feature/v0-backend.

## Task 2 — Report usability (frontend)
- [x] Base frontend work on existing integrated functionality.
- [x] Add validated finding-to-new-line navigation and regression checks in existing diff tests.
- [x] Add explicit history/open loading and error states, revision/coverage metadata, source/severity filters and safe AI diagnostics to DashboardPage.
- [x] Load local UI/code fonts, improve spacing and responsive report readability in styles.css without dependencies.
- [x] Run relevant frontend checks and production build; review and commit on feature/v0-frontend.

## Task 3 — Integration
- [x] Merge feature commits into integration/v0-demo, preserving original branches and user changes.
- [x] Check backend health, diff whitespace and branch status; review final code independently.
- [x] Report checks actually executed and limitations; no claim of live provider verification.

## Verification and review record
- Backend: 67 native Node offline tests passed after the storage-budget fix; no live provider calls.
- Frontend: 15 API/parser/render checks passed; Vite production build passed once.
- Eight existing local saved reports rendered through the new report component.
- Isolated MongoDB check verified patch/revision persistence, duplicate rejection and read after reconnect; temporary verification database removed.
- Running backend health endpoint returned status ok; local credentials absent from committed changes.
- Independent review found unbounded BSON snapshot size; added a tested 4 MiB retrieval budget before AI work. Complete patches are retained within the budget; oversized PRs fail explicitly.
- Deferred minor: reopening saved failed reports uses generic safe guidance rather than showing historical raw error text. Submission still shows the current sanitized failure.
- Browser unavailable through computer-use connector: interactive click/layout QA remains unverified. Parser navigation resolution, initial selection and highlighted row verified offline.
- No PR-context/repository-overview mode or AI provider behavior changes in this slice.

## Contextual review continuation — completed implementation chunks
- 5cf197b: configurable/default 120-second SDK/server deadline; local ignored environment updated; 47 AI-service checks passed for that chunk.
- 6b20f41: revision-pinned bounded source windows and selected relative imports, safe intent, production-first context, numbered deleted-side evidence; 20 context/retrieval checks passed.
- f7c7ac6: structured summary, walkthrough, impacts, limitations, location validation and advisory recommendation; controller/model persistence; 56 service/controller checks passed.
- 26cb7c9: persist safe actionable GitHub failure codes; 17 controller/retrieval checks passed.
- 0b4f247: contextual review dashboard, old-side navigation and safe failure guidance; 18 frontend checks passed.
- 95c8993: independent review caught raw-source context storage bypassing provider secret filtering; regression failed before fix and passed after keeping enrichment transient. Final backend suite: 78/78.
- Vite production build passed. Final real isolated MongoDB check preserved the validated review and patches while excluding raw source context. Temporary verification database removed.
- Nine actual local saved reports rendered through the updated UI. Browser connector inventory was empty; interactive layout/click QA remains unverified.
- Exactly one live generation request was made after offline verification. GitHub retrieval succeeded (10 bounded requests); four source windows reached input preparation. Gemini returned HTTP 503 in 2792ms with timeout 120000ms and attempts 1. No retry was made. Analysis 850ccc03-7782-4784-9daa-d71fc451035d saved deterministic results and honest AI-unavailable status; saved read was verified.
- Live AI acceptance remains blocked by the upstream 503 response. A real successful contextual review is NOT confirmed by mocked tests. Another generation requires a new controlled attempt; no retry loop/fallback provider was added.
- Deliberate scope: retain the explicit 4 MiB snapshot guard; no storage migration, repository-wide graph, new application files or dependencies. Unknown legacy failures retain generic guidance; newly recorded failure codes show actionable messages.

## 2026-11-01 — UI/progress completion and failure ledger
- 40df2b0: compact header, report summary, diff/file workspace beside an accessible overview/findings panel, responsive stacking and preserved evidence/filter/history controls. Nineteen frontend checks passed for the UI chunk.
- ff17d1c: opt-in NDJSON stages on the existing POST; JSON responses preserved; safe terminal error/result and disconnected-client persistence. Twelve controller checks passed. A test initially compared an in-memory undefined field against JSON transport; compare JSON-normalized values because JSON omits undefined fields.
- 81c94e3: incremental UTF-8/frame parsing, stage validation/size bound, one request without retries, real-stage spinner, elapsed timer and unmount cleanup. Twenty-three frontend checks passed at this point.
- Independent static review found no critical/important defects; it noted skipped-AI progress wording and an outdated above/below pointer. The progress requirement makes skipped-state honesty important: fixed it instead of deferring.
- d3539fb: emit AI-review stage only at the actual SDK request boundary; skip context retrieval when no provider/reviewable diff exists. Two new regressions failed before the fix. Final backend suite passed 84/84.
- 8697658: track actual received stages so skipped phases are never marked complete; corrected the AI-status pointer. New skipped-state regression failed before the fix. Final frontend checks passed 24/24.
- Final Vite production build passed after review fixes. Actual HTTP test with a deliberately pending mocked AI request confirmed progress reaches the client before result completion; real isolated MongoDB retained the final review/diff and excluded raw retrieved context. The temporary verification database was removed.
- Real end-to-end request through the actual client stream parser, running backend, GitHub, Gemini 3.6 Flash and MongoDB succeeded. Fetching arrived at 190ms, context at 1869ms, reviewing at 4346ms and saving at 10160ms. Valid partial review saved as analysis 875cade1-0ad6-4e29-8376-6a7f2bd6f67f; read-back matched. Total observed time 10212ms; AI request 5810ms, attempts 1. These are observations, not response-time guarantees.
- The actual saved live report and active progress state rendered through the updated React workspace successfully. Browser inventory was empty and opening the in-app browser returned unavailable; interactive click/layout QA is not claimed.
- No new application/test files, dependencies, background infrastructure, webhook or MCP implementation. Existing user changes remain unstaged, secrets are absent from committed diffs and main is unchanged.

## 2026-11-02 — Approved continuous roadmap execution
User authorized remaining roadmap features in small tested commits; defer account registration, credential entry, license selection and physical/live onboarding verification. No main merge or paid deployment.
Priority/tasks: (1) E2 SDK token usage + prompt/schema/run identity; (2) E3 opt-in lexical repository guidance and reproducible retrieval comparison; (3) authenticated GitHub App/session and installation-scoped reports; (4) E4 separate finding feedback API/UI; (5) E5 local read-only official-SDK MCP; (6) E6 configurable deployment origins, offline CI, usage guard and setup documentation; (7) integrated checks + independent review.
Ruling: keep existing checkout and mandated feature branches; preserve unstaged .env.example, AGENT.md and RULE.md. No worktree/dependency duplication needed for sequential work.
Ruling: no embeddings provider added without an evaluated benefit. Ship explicit lexical baseline experiment; do not claim semantic RAG or improved accuracy.
Ruling: preserve local single-user mode; production requires authenticated sessions and MongoDB. GitHub App credentials/manual registration remain owner actions, while code paths receive offline contract tests.
Task 1: in progress — actual provider usage only; absent counts remain null.
Task 1: backend complete — SDK-only usage (unknown=null), UUID run identity, prompt/schema versions persist through schema and evaluation artifacts. Targeted Node checks 71/71 passed; two new usage regressions observed RED then GREEN. No live call needed.
Task 2: lexical retrieval slice complete — opt-in REVIEW_GUIDANCE=lexical ranks README/CONTRIBUTING sections at head revision within existing 8-request/8k-character context budgets. Source coordinates/revisions persist in coverage. 74 targeted checks passed. No comparative quality gain/embeddings claim; frozen retrieval comparison remains unmeasured.
Task 3: backend App slice complete — OAuth state+PKCE, opaque HttpOnly sessions, fresh installation/repository checks, narrow installation tokens, scoped webhook IDs and report reads, production report fail-closed and in-process review caps. 102 backend checks passed, including callback replay/cookie/origin regressions. New github.app.js is a genuine auth responsibility. Live registration/credentials/onboarding remain manual. Sessions/caps are intentionally single-process and reset at restart; no refresh tokens stored.
Task 4: feedback backend complete — bounded verdict/reason, actor-derived key, scoped authorization, atomic Mongo update, separate annotations preserve findings. 19 targeted checks passed including validation/reopen path.
Task 5: local MCP complete — official SDK stdio, bounded list/read projections, explicit local installation scope, credential-pattern redaction, malformed IDs/unknown/other-installation denied. Actual SDK client/server in-memory protocol test passed (discovery and calls); no Gemini/GitHub calls. Added SDK and required zod peer only. Persistent Mongo required for standalone process; remote MCP deliberately not exposed.
Frontend chunk complete — original-index finding feedback with reason/loading/error/saved states, persisted annotations read on reopen, usage/version/run details, GitHub connect/install/logout state, same-origin /api + Vite dev proxy and credentials. 35 frontend checks passed (two new regressions RED to GREEN). Frontend branch initially blocked by user .env.example; safely fast-forwarded it in a temporary clean worktree, removed only that clean worktree, then switched without stashing user data.
Task 6: release code slice complete — same-process static SPA fallback (API misses remain JSON), configurable APP_ORIGIN/CORS, production App+Mongo startup requirements, runtime storage gate and offline GitHub Actions job. Session response now exposes only safe user ID/login, never tokens. Four auth/release checks passed, including an observed RED then GREEN API-routing test. No deployment/account mutation.
Final review fix 1: scope report queries BEFORE limit (including MCP), normalize App repository names, add compound installation/repository/date index and no-store API responses. Mixed-installation history regression observed RED to GREEN; full backend suite 106/106 passed. Index is additive; no report migration.
Live evaluation: five completed cases B01/B02/B03/B04/B06 with actual SDK token usage; B05 HTTP503; B07/B08 HTTP429. C01 saved INTERRUPTED (actual request outcome unknown after filesystem save interruption), C02-C04 not run. No quality score or confirmed total-call count claimed. Atomic rename hit Windows EPERM; added bounded filesystem-only retry and collector stop on quota rejection. Both regressions observed RED to GREEN, collector checks 6/6 passed; no provider retries. Saved raw run remains unadjudicated.
Final review fix 2: pass connected userId through DashboardPage -> ReviewPage -> AnalysisReport. Reviewer reproduced actual loaded-page ReferenceError; added the loaded ReviewPage regression, observed RED then GREEN. Full frontend checks 36/36 passed.
Task 2 experiment completion: extended existing collector with offline lexical relevance fixture and explicit --semantic opt-in using two bounded official-SDK embedding batches. Three original E1-linked synthetic queries, dataset hash/source references, cosine validation and hit@1; labels never enter embeddings. Seven collector checks passed; offline lexical artifact saved with zero provider calls. Live semantic comparison not attempted after observed 429; no production default changed.
Optional GitHub feedback slice complete — default OFF; after saving, post one advisory summary/link per installation+repo+base/head with bounded bot-comment lookup and same-process race guard. No findings/source code posted; unavailable AI is explicit. Narrow token requests PR write only if GITHUB_POST_REVIEW=true. Posting errors do not erase saved results. Mocked summary/dedup regression observed RED to GREEN; 22 targeted checks passed. No real GitHub write made; App permission grant and live posting remain manual.
Self-check found malformed GitHub JSON could leak a body fragment through SyntaxError.message. Added sanitization in githubRequest; new regression observed RED to GREEN; six App checks passed.
Final verification: 112 backend tests, 7 Python tests, 36 frontend tests and Vite production build passed. Real isolated MongoDB retained diff/feedback/SDK usage; temporary verification database removed. HTTP health/report API and built /app + /analyses/report-demo deep links passed; API unknown returned JSON404. Raw live artifact scored successfully with qualityReady=false and null precision/recall; no model success invented for interrupted case. Main remains 844a30059c1fb797de2b7e5b0bce3e4e51e6485c. User .env.example/AGENT.md/RULE.md remain unstaged.
Optional-slice independent review found manual user-token posting would produce human comments and evade bot-only dedup. Fixed by always minting a narrow installation token inside summary posting; original retrieval user token is not reused. Bot-identity regression observed RED to GREEN; full backend suite 112/112 passed. Reviewer found no additional critical/important issues in new embedding/sanitization slices. No live GitHub comment or embedding request was made.
Delivery checkpoint: integration/v0-demo contains all feature commits; main unchanged. All 19 backend JS files passed syntax check, diff check clean, committed-source token-pattern scan found no matches (heuristic, not a full secret audit). Remote refs checked: main and test/webhook-demo; integration is not pushed. Publishing/draft PR, license choice and real deployment remain owner release actions; no shared-branch or account mutation made. No deferred application fix remains from independent review. Manual acceptance and provider-quota-blocked live validation remain explicitly open.

## 2026-11-12 — Simple interview demo upgrade (approved)
Goal: beginner-readable interview demonstration. User approved autonomous implementation, useful AI calls, rules updates, chunk commits and verification; no production-scale rebuild.
Task 1: update existing rules and this ledger; preserve user .env.example.
Task 2: repair guidance retrieval budget, chunk long sections with real coordinates, expose source coverage; lexical default stays explicit.
Task 3: bounded previous-revision memory for the same PR/installation, useful feedback only, current evidence remains mandatory; MongoDB reused.
Task 4: local pipeline stage timings plus optional Langfuse OTLP export of allowlisted metadata, no raw code/prompts/feedback. No SDK needed for a small HTTP-JSON exporter.
Task 5: read-only public sample from owned frozen fixtures and actually recorded model output, available without App configuration; reuse existing report UI and disable writes.
Task 6: update roadmap/README, independent review, relevant suites/build/HTTP checks and one controlled provider check only if useful. Account setup/credentials/real hosted onboarding remain owner steps.
Decision: implement concepts with existing plain JS/MongoDB; do not install LangChain/LangGraph/Chroma. Existing direct SDK and bounded retrieval already cover their needed demo responsibilities.
Task 2 complete: long-section overlapping chunks retain source coordinates; guidance mode reserves two of eight source reads. Two meaningful retrieval regressions failed before change; targeted context/provider/retrieval tests passed. Existing modes and input limits retained.
Task 3 complete: bounded same-PR/installation previous-revision lookup, at most three useful labels for current changed files, sensitive titles/reasons excluded, provenance in coverage, prompt v2 requires current evidence. Scoped lookup and safe memory regressions observed RED to GREEN; 83 targeted checks and an additional model-input memory check passed. Optional lookup failure does not discard review; no new collection/file/framework. Added compound key/date index without migration.
