# PR workflow polish implementation plan

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
- [ ] Add offline regressions for pagination, revision/rename retention, safe upstream failures, invalid input and IDs across controller reloads.
- [ ] Run targeted tests RED, then implement in pullRequest.service.js, analysis.controller.js and analysis.repository.js.
- [ ] Preserve patch strings; paginate up to GitHub's 3000-file limit, flag incomplete retrieval, record base/head SHAs and previous paths. Bound upstream request time and sanitize errors.
- [ ] Use randomUUID report IDs and insert rather than upsert, preserving legacy reads.
- [ ] Run backend offline suite; review and commit on feature/v0-backend.

## Task 2 — Report usability (frontend)
- [ ] Base frontend work on existing integrated functionality.
- [ ] Add validated finding-to-new-line navigation and regression checks in existing diff tests.
- [ ] Add explicit history/open loading and error states, revision/coverage metadata, source/severity filters and safe AI diagnostics to DashboardPage.
- [ ] Load local UI/code fonts, improve spacing and responsive report readability in styles.css without dependencies.
- [ ] Run relevant frontend checks and production build; review and commit on feature/v0-frontend.

## Task 3 — Integration
- [ ] Merge feature commits into integration/v0-demo, preserving original branches and user changes.
- [ ] Check backend health, diff whitespace and branch status; review final code independently.
- [ ] Report checks actually executed and limitations; no claim of live provider verification.
