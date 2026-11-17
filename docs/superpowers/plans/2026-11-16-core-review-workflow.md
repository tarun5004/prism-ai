# Core PR review workflow implementation plan

**Goal:** implement the main GitHub PR-review loop inspired by CodeRabbit, in Prism's existing modular backend. This is a bounded demo implementation, not commercial feature parity.

**Architecture / design:** signed event -> authorize command (if any) -> durable PR controls -> existing queue/inline runner -> trusted repository policy -> pinned full/incremental diff -> existing context/LangGraph/model/validation -> saved report -> optional GitHub summary, inline findings and commit status. Manual requests reuse the same review service. No repository code execution.

**Stack:** existing Express, Mongo/Mongoose, LangChain/LangGraph, React and Node test runner. No new runtime dependencies. Work in the existing checkout to preserve the user's current local setup; stage exact files and leave the user's `.env.example` edit alone.

**References:** [review overview](https://docs.coderabbit.ai/guides/code-review-overview), [commands](https://docs.coderabbit.ai/reference/review-commands), [configuration](https://docs.coderabbit.ai/reference/configuration), [public architecture](https://docs.coderabbit.ai/overview/architecture). Public docs establish product behavior, not private implementation.

## Contracts and constraints

- `.prism.json` is optional and read only from the PR base SHA when `REVIEW_REPOSITORY_CONFIG=true`. Strict bounded JSON: `autoReview`, `ignorePaths` (path prefixes), `pathInstructions` (`path`, `instructions`). Missing file uses defaults; malformed/unavailable configured policy fails closed. Settings are untrusted guidance, never executable prompts/tools or evidence.
- `reviewScope` records full vs incremental, previous report/head, exclusions and fallback reason. Incremental comparison only after a successful prior AI review, same installation/PR/base, proven ancestor and complete bounded compare. New diff snapshot is stored with `diffBaseSha`; old evidence uses that SHA. On uncertainty use full PR review. Manual/full command uses full diff.
- Commands are exact `@prism-ai help|review|full review|pause|resume|summary`. Only signed, created PR comments by freshly verified write/maintain/admin users can change state/start work. Commands never accept arbitrary instructions or trigger for bot comments. Pause is stored per installation/repo/PR; review/full review deliberately bypass pause once. Existing quotas/dedup still apply.
- Inline feedback is default off, bot-only, max five validated AI findings, pinned latest head; map incremental findings only onto actual current PR diff lines. Post `COMMENT`, never approve/request changes. Existing markers stop sequential duplicates; crash/network ambiguity is not exactly-once delivery.
- Commit status is default off, advisory `prism-ai/review`; missing credentials/network failure never discards report. Unavailable/partial AI must not become a successful clean review. No merge gating guarantee.
- Never stage secrets, deploy, push, run paid/load calls or execute contributor code. Live verification separate from mocks. Repository config/guidance does not override security boundaries.

## Tasks (each gets focused tests, then a small commit)

- [x] 0. Verify and commit the existing reliability changes only (exclude user's `.env.example`).
- [x] 1. Add bounded trusted repository controls and path instructions. New `pullRequest/review.policy.js`; existing PR service, AI context/prompt and shared analysis service consume it. Test invalid settings, missing file, trusted SHA, exclusions, untrusted/secret guidance.
- [x] 2. Add safe incremental compare and visible scope. Existing PR service/repository/analysis/UI. Test successful baseline, wrong installation/base, force-push/incomplete compare fallback, old-side source SHA. Keep full manual review.
- [x] 3. Add opt-in inline findings and honest commit status in existing GitHub integration; persist delivery statuses. Test duplicate markers, stale head, evidence/line mapping, max count, provider failure and permissions. No live GitHub write required.
- [x] 4. Add exact PR commands and persistent pause/resume using existing auth-state store plus existing webhook/job modules. Test signature/actor/permission gate, unsupported/edited/bot comments, paused automatic events, deliberate one-shot review/full review, duplicate delivery, queued pause recheck.
- [x] 5. Integrate workflow regression tests, update README/cheatsheet/roadmap and run all offline tests/frontend build. Self-review the diff for security, scope, concurrency and budget. Record what still needs owner GitHub permissions or live setup.

## Verification and review focus

Use existing `node --test` suites; mock GitHub/model services. Preserve real report/API integration tests and checkpoint regressions. Test repeated events and failures, not artificial test counts. Full checks: `npm test --prefix server`, `node --test client/test/*.test.js`, `npm run build`, `git diff --check`. Baseline: 149 backend passed, one opt-in integration skipped on 16 November before changes.

## Progress / deviations

Task memory saved in the user-requested memory extensions folder. No new infrastructure planned. Full agentic chat, IDE plugins, auto-fixes/merge, arbitrary static-tool execution and commercial dashboards remain outside this core PR loop; existing MCP, review memory, RAG, summary/walkthrough, feedback, queue and email are reused.

## Completion evidence — 17 November 2026

- Existing reliability slice: `907a9e0`; trusted policy: `ebe174b`; incremental: `87ec343`; inline/status: `61236ba`; commands: `3a093b9`; replay/permission/integration hardening: `cb94864`.
- Full backend suite: 165 passed, 1 opt-in integration skipped. Frontend: 41 passed. Python evaluation tests: 7 passed. Production frontend build and diff whitespace check passed.
- Separately enabled real MongoDB/Azurite integration: 1 passed, including concurrent pause ordering, skipped paused queue work, and separate-process pause/checkpoint recovery. Temporary generated test database and queue cleaned by the existing integration fixture.
- Focused independent read-only review found command identity changed on redelivery after a push; reproduced, regression added and fixed. Final pass found no additional confirmed important issue. Retained original control storage shape and awaited its unique index, avoiding a schema migration solely for this feature.
- New GitHub/model interactions were mocked. New command/inline/status live acceptance awaits owner App event subscription/optional permission settings; flags remain default off. No push/deployment/new paid call. Full CodeRabbit parity, human review-quality score and Gemini upstream reliability are not claimed.
- No new runtime dependency; two focused runtime modules plus this plan. User-owned `.env.example` edit remains untouched and uncommitted.