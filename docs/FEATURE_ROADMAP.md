# PRism AI — feature status and implementation roadmap

Status date: **1 November 2026**. This is the current feature/status source. Earlier phase plans remain historical; the implementation ledger is [here](superpowers/plans/2026-10-31-pr-workflow-polish.md).

## 1. The product we are building

**Current demo:** a developer submits a PR URL, or configures a repository webhook, and inspects a saved diff plus advisory AI review.

**Target recruiter experience:** open the deployed website → click **Install on GitHub** → choose repositories and approve narrow permissions → raise/update a PR → get a review without installing tools or creating a webhook manually.

The target onboarding flow is **not implemented yet**. A GitHub App is the appropriate installation/event-delivery mechanism. MCP is a separate interface for compatible AI clients to use PRism tools/reports; connecting an MCP server alone does not subscribe a repository to GitHub PR events.

GitHub App registration does not require a paid GitHub plan. Hosting, storage and AI usage are separate; do not promise unlimited free hosted reviews. The project is a focused personal/portfolio demo, not an enterprise platform.

## 2. Read the status labels correctly

- **Implemented:** present in the current local V0 code; not necessarily deployed publicly.
- **Recorded verification:** a previously executed check or author-reported manual demo, with its scope stated.
- **Planned:** acceptance criteria below are future work, not a feature claim.
- A passing mocked API test is not live-model quality evidence. A live screenshot is not a benchmark. An accepted webhook is not a completed AI review.

## 3. Implemented inventory

| Feature | State / evidence | Boundary |
| --- | --- | --- |
| Manual GitHub PR submission | Implemented; backend/controller and client API checks recorded | One PR URL per run; no repository-wide review |
| PR metadata, paginated files and patches | Implemented in pullRequest.service.js; offline retrieval checks | Endpoint cap is 3,000 files; 4 MiB snapshot guard; incomplete coverage remains visible |
| Base/head revisions and mixed-revision guard | Implemented; revision checks recorded | Refuses a snapshot that changes during retrieval |
| Unified diff viewer | Implemented; parser/render tests | Multiple hunks, old/new lines, added/deleted/renamed files; no side-by-side mode |
| Deterministic risk rules | Implemented in analysis.rules.js | Signals are advisory, not confirmed defects |
| Official Gemini SDK + structured output | Implemented; mocked failure tests and prior live demo evidence | Single provider; no automatic generation retry; configured model must be available to the key |
| Bounded contextual review | Implemented in ai.context.js / pullRequest.service.js | PR intent, changed-line windows, selected JS/TS direct imports; no embedding index or complete dependency graph |
| Findings and review validation | Implemented; existing evidence/schema tests | Rejects invalid paths, line sides/numbers, types, severities and evidence. Does not prove semantic correctness |
| Walkthrough, impacts and advisory recommendation | Implemented; report render tests and author live screenshot | States scope/limitations; never approval or merge automation |
| Failure diagnostics and coverage | Implemented: duration, deadline, attempts, allowlisted failure details and omissions | Actual token counts, prompt version and comparative experiment records are pending |
| Saved reports and history | Implemented; repository/schema checks and isolated MongoDB verification | MongoDB persistence or temporary in-memory fallback; no user/install ownership enforcement |
| Actual progress stream | Implemented through existing POST endpoint | NDJSON stages and elapsed time; no invented percentages or response-time SLA |
| Routed dark UI | Implemented: `/`, `/app`, `/analyses`, `/analyses/:id` | Charcoal/orange theme, hover/focus/tap feature cards, modest depth, local fonts; browser automation QA incomplete |
| Saved sample entry and source link | Implemented; client checks and prior local report-read verification | Uses real saved history; fresh stores have no sample; source link opens the repository |
| Signed repository webhook | Implemented in pullRequest.webhook.js; signed HTTP tests | One configured repository; raw-body HMAC, event validation, drafts/closed PRs ignored |
| Webhook dispatch and deduplication | Implemented; in-flight/persisted duplicate tests and isolated MongoDB verification | Two concurrent jobs, one Node process, deterministic repo/PR/base/head ID; no durable queue |
| Live webhook demo | Author reported signed ping, PR event, saved AI review/diff and no second report after redelivery | Manual observation; exact provider call count was not independently instrumented |

Existing recorded baseline: **91 backend offline tests**, **33 frontend checks**, backend syntax/local health and frontend production build passed during implementation. These counts are a dated baseline; update them after relevant future checks, not after an unexecuted assumption.

## 4. The public-launch gap: GitHub App onboarding

Priority: **P0 before inviting users to connect private repositories**. Product integration work, not a claim of additional model intelligence.

| Slice | Minimal implementation | Done when |
| --- | --- | --- |
| App registration and installation entry | Register PRism GitHub App; add an Install on GitHub CTA linked to its installation page | A test user can select repositories without manually creating a webhook |
| Installation authentication | Server-side app credentials and short-lived installation tokens; replace the global-token-only retrieval path for App requests | Fetches are authorized for the event's installation; private key/tokens never reach the client/logs |
| User/session and installation binding | Authenticate the dashboard visitor and verify their installation/repository access; protect callback state | An installation ID supplied by a browser is never sufficient authorization |
| Scoped reports and events | Attach installation ownership to reports/deduplication and filter every list/detail request | Cross-installation report access fails, including guessed IDs; webhook data remains isolated |
| Permission/lifecycle handling | Request minimum permissions; handle installation removal and repository-access changes | Removed access cannot continue reading private reports or fetching code |
| Live onboarding test | Real deployment + test installation + non-draft PR and duplicate delivery | Complete flow works without local tunnel/software for the end user |
| GitHub feedback posting | Optional follow-up: concise review/comment with report link, using required PR write permission | One appropriate comment per review/revision; private report links remain access-controlled |

Reuse the current GitHub service, shared analysis service, webhook module, model/repository and dashboard. Keep existing manual URLs usable. App registration can use new dedicated auth code where that is a genuine responsibility; do not bolt authentication into AI prompts.

Boundaries: no unrestricted GitHub-account access, auto-merge, arbitrary repository execution or guaranteed email delivery. Current events review open/updated PRs, not every merge/account event. GitHub notification behavior depends on user settings; a custom email service is outside V0 scope.

## 5. AI-engineering upgrades, ordered by value

These are a proposed sequence, not implemented features. Prefer useful, explainable additions over collecting framework names.

### E1 — AI Evaluation V1 · P0 · next recommended chunk

**Skill evidence:** labelled datasets, precision/recall, false alarms, error analysis and reproducible experiments.

- Curate 15–20 small, owned/licensed, frozen code-change fixtures: known bugs, clean changes, removed guards, missing context and adversarial repository instructions. Label expected bug IDs, files, acceptable line ranges and evidence; do not grade by exact generated wording.
- Use a small Python evaluation script as a meaningful Python component. It should score saved JSON outputs without needing a new backend or framework. Add a fixture data file only because it represents an actual evaluation dataset.
- Record dataset version, model, prompt version/config and run IDs. Keep a held-out subset; do not tune prompts against every test case.
- Report finding precision, recall, false-discovery rate, invalid-evidence rate, request failure rate and latency. Show the sample size and limitations; define zero-denominator results explicitly rather than inventing scores.
- Keep recorded/mock evaluation separate from an explicitly requested live model run. Offline CI must not silently spend provider credits. Preserve failed/partial runs in coverage reporting.

**Files to reuse:** docs/beta/TEST_CASES.md and DEMO_AND_EVALUATION.md, AI validation/input modules. New evaluator/fixture files are justified responsibilities, not new infrastructure.

**Acceptance:** one documented command reproduces metrics from a versioned saved run; a seeded wrong finding/miss changes the expected metric; failure cases are counted; no unsupported accuracy percentage appears in README/CV.

**Known documentation correction for this slice:** the older evaluation notes call `false-positive findings / total findings` a false-positive rate. That is a false-discovery proportion, not the conventional `FP / (FP + TN)` FPR. Correct the terminology when implementing E1.

### E2 — Review diagnostics and experiment identity · P0

**Skill evidence:** LLM observability, token budgeting and traceable prompt/model changes.

Extend existing ai.service.js, model/report persistence and request tests with SDK-reported input/output token usage, prompt/schema version and an analysis/run reference. Retain existing timing/failure diagnostics. Represent unavailable usage as unknown, not zero; do not log raw sensitive prompts. Show compact request details in the existing report instead of adding an analytics dashboard.

**Acceptance:** metadata survives save/reopen; unavailable provider usage is honest; mocked token fields are labelled as test evidence; version changes distinguish experiments. Do not publish estimated currency cost without a dated, verified pricing basis.

### E3 — Retrieval quality experiment · P1

**Skill evidence:** chunking, retrieval, grounding, embeddings and baseline comparison.

Reuse the bounded context path to retrieve relevant, revision-pinned repository guidance such as README or CONTRIBUTING sections. Start with a transparent lexical baseline and a small candidate budget. Compare optional semantic embeddings against that baseline on E1 cases before changing defaults. Store source path/revision references and omission reasons. No vector database service or repository-wide clone is required for a small experiment.

**Acceptance:** retrieved text can be traced to source; budgets and sensitive-content filtering still apply; baseline and embedding runs are evaluated separately. Claim better retrieval only if measurements support it. Current direct-import enrichment must not be relabelled semantic RAG.

### E4 — Finding feedback · P1

**Skill evidence:** human evaluation and labelled feedback collection.

Add Useful / Incorrect plus an optional reason to the existing finding UI and a small validated API/persistence path. Keep reviewer annotations separate from the original generated finding. Protect ownership before public use; this is not automatic model training.

**Acceptance:** feedback survives reopening, invalid values are rejected, one user cannot edit another installation's annotations and the original evidence remains intact. Human labels can inform a reviewed future evaluation set, not silently overwrite ground truth.

### E5 — Read-only MCP connector · P1

**Skill evidence:** typed tool contracts, protocol integration and safe tool outputs.

Expose bounded saved-report list/read operations through the official MCP SDK, reusing repository/API read logic. Start locally; a remote connector needs authenticated, installation-scoped access. Keep repository content untrusted and never return credentials. No generation, GitHub write tool or autonomous agent loop in the first slice.

**Acceptance:** a compatible client discovers tools, reads an authorized report, rejects malformed/unknown IDs and cannot read unauthorized reports. MCP connection does not replace the webhook event source. Shipping MCP tools alone is not evidence of autonomous agent reasoning.

### E6 — Reproducible delivery and deployment · P0 before public launch

**Skill evidence:** software delivery, environment handling, CI and operational judgment.

- Publish the reviewed integration branch and open a PR; merge only with explicit approval. Remote `main` currently lacks the latest local V0.
- Add offline backend/frontend checks and build to CI. Keep live model calls opt-in.
- Configure frontend API origin/CORS and SPA fallback for `/app` and report deep links; remove the localhost-only deployment assumption.
- Use persistent storage and a long-lived backend suitable for the current in-process webhook flow; document restart/redelivery behavior. A sleeping/free hosting tier may not suit automatic events.
- Gate public report/analysis endpoints with authentication and permissions; enforce modest usage limits so an owner API key is not a public spend endpoint. Check secret rotation before release without displaying credentials.
- Choose the project license, verify setup from a clean checkout and publish the real demo URL only after end-to-end testing. Containerization is optional if it solves a deployment need.

**Acceptance:** clean install/check/build instructions work; public users cannot access each other's private data; deployment accepts a real signed PR event and saves an inspectable report. No fixed 14-second promise or unlimited-free-inference claim.

## 6. What we intentionally will not add just for a CV keyword

No backend rewrite to FastAPI, random classifier, mandatory LangChain/LangGraph, multi-agent swarm, Kubernetes, Redis queue or second database for appearance alone. Python/SQL/ML fundamentals still need separate practice; this applied-LLM project does not demonstrate model training, fine-tuning or deep-learning research.

Two relevant job-description examples researched on the status date: [WonderBotz junior role](https://wonderbotz.applytojob.com/apply/RbPIL43iH6/Junior-AI-Engineer) lists programming, LLM/retrieval, evaluation and delivery skills; [Luxoft junior AI/ML role](https://career.luxoft.com/jobs/junior-aiml-engineer-28443) also requests Python/SQL, evaluation, retrieval and ML fundamentals. Requirements vary; this is a project-to-role mapping, not a guarantee of hiring or an exhaustive market survey.

## 7. Working agreement for the next chunks

1. Read existing code and this status before proposing a new module.
2. Implement one acceptance-sized chunk; test it, review it and commit it before the next.
3. Update this file with the exact implemented slice, executed evidence and remaining limits. A proposal never becomes complete just because code was generated.
4. Use feature/v0-backend and feature/v0-frontend for application changes; combine on integration/v0-demo. Preserve main and user changes.
5. Reuse existing modules. A new file is allowed for a real responsibility (for example labelled data or an evaluator), not to avoid reading current code.

**Immediate next step:** E1, starting with agreement on a small labelled evaluation set and the metric definitions. It gives the existing review engine a measurable baseline before adding retrieval behavior or more model calls. GitHub App onboarding remains the subsequent product/release track; neither requirement has been dropped.
