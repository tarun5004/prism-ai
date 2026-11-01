# PR workflow polish implementation plan

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
