# PR workflow polish implementation plan

## 2026-11-01 — approved UI workspace and live progress

This existing document is the task ledger requested by the user. No temporary database, new application files, packages, webhook or MCP work is needed for these two features.

**Design:** Keep graphite/lime, Inter/JetBrains Mono and existing evidence rendering. Use a compact application header, report/revision summary and a desktop workspace with file navigation + unified diff beside an overview/findings review panel. Stack panels on smaller screens. Keep history, filters, old/new evidence navigation and honest AI status accessible.

**Progress contract:** Existing POST /api/analyses keeps its JSON behavior. Opt-in Accept: application/x-ndjson emits newline-separated progress frames {type:'progress',stage:'fetching'|'context'|'reviewing'|'saving'}, followed by exactly one {type:'result',report} or {type:'error',message}. Stages reflect actual boundaries; final report retains separate AI status. No timer-driven stages, guessed percentages, queues, new endpoints or automatic retries. Elapsed time is informational only. Interrupted streams produce an error, never a second generation request.

- [ ] UI chunk: extend DashboardPage.jsx, DiffViewer.jsx/styles.css and existing render tests; verify and commit on feature/v0-frontend.
- [ ] Backend chunk: opt-in progress framing in existing analysis.controller.js; extend existing controller tests for ordering, errors, persistence and disconnected clients; verify and commit on feature/v0-backend.
- [ ] Client chunk: incremental UTF-8 stream parsing in analysis.api.js; progress/elapsed UI in DashboardPage.jsx with cleanup; existing API/render tests for split frames, failures and honest statuses; verify and commit on feature/v0-frontend.
- [ ] Integrate, independent review, full relevant offline checks, production build and one real streamed review if service available. Record observed states; browser QA depends on available connector.

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
