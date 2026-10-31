# PR workflow polish implementation plan

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
