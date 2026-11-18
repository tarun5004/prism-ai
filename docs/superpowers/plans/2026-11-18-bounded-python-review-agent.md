# Bounded Python Review Agent Implementation Plan

> **For agentic workers:** Use `superpowers:executing-plans` for inline task-by-task execution. Steps use checkbox syntax. Owner explicitly approved this design and instructed implementation; do not introduce another routine approval stop.

**Goal:** Add a bounded, useful Python review agent with evidence tools, visible activity, human-approved summary publishing and honest evaluation.
**Architecture:** Existing Node auth/queue/jobs/checkpoint guard remain authoritative. A private stateless FastAPI service runs the per-request LangGraph investigation. Node revalidates and saves results; React displays activity and approval.
**Tech Stack:** Existing React/Node/Mongo/Azure, Python 3.12+, FastAPI/Pydantic v2, LangGraph, Gemini LangChain adapter, uv, pytest/httpx.
**Spec:** `docs/superpowers/specs/2026-11-18-bounded-python-review-agent-design.md` (owner approved).

## Global Constraints

- Five tools; 2 decision rounds; 4 tool calls; 3 provider requests total including retries, one reserved for final review.
- Agent deadline 90 seconds; model attempt <=30 seconds; Node HTTP timeout 150 seconds.
- Decision output <=512 tokens; final <=4096 tokens; raw request <=256 KiB.
- Existing 5-file / 12000 serialized diff-character / 8000 context-character bounds remain; at most 16 context chunks, 2/8 context reads reserved for tests.
- Exact source side/revision/line evidence; no execution, arbitrary URLs, secret forwarding, silent provider fallback or inference replay.
- Normal JSON; no Python persistence/resume store. Existing Node checkpoint guard owns uncertainty.
- No automatic GitHub summary/inline posting for agent reports. Explicit authorized approval precedes one fixed summary write.
- No commit/push/deployment without explicit request. Preserve unrelated PDF/output/tmp files.
- Implement inline in the current shared checkout on a feature branch; no new worktree without consent. Keep unrelated edits untouched.

## Review Focus

1. Removed/renamed/incremental files: evidence must use the correct old/new revision and original coordinates (tasks 1-3).
2. Unknown tool IDs, malicious arguments, untrusted PR instructions: deny access without widening scope or leaking raw model errors (tasks 1-2).
3. Lost Python response / provider timeout: no second POST, fallback provider or completed AI success; owner-checked unknown job state (task 3).
4. Duplicate/stale/revoked publication: durable atomic claim and fresh write permission/revision check before external POST (task 5).
5. Missing usage/prices/human labels: keep values unknown; do not manufacture cost or quality metrics (task 6).

## Interfaces

Contract JSON uses existing camelCase report/source field names so Node can reuse `prepareAiInput`, `validateFindings` and `validateReview`.

- `AgentRequest`: `schemaVersion='prism-agent-v1'`, `reviewId`, `scope={installationId,repository,number,baseSha,headSha,diffBaseSha?}`, `intent`, prepared `files`, approved `sources`, `rules`, `coverage`, optional sanitized `memory`.
- `Source`: `sourceId,filePath,lineSide,startLine,revision,code,role,relatedTo[]`. IDs are request-local; no filesystem/network access.
- `AgentDecision`: `action='tools'|'finish'`, `calls[]` (<=2). Each call has allowlisted `name` and validated arguments.
- `AgentResponse`: same version/id/scope, `status='completed'|'partial'|'unavailable'`, raw validated `findings`, optional `review`, `errorCode`, `diagnostics={events,attempts,usage,durationMs,stopReason,provider,model,...}`. No transcripts/source windows.
- Uncertain provider execution returns a safe `MODEL_REQUEST_UNCERTAIN` error; Node throws `INTERRUPTED_MODEL_REQUEST`. Node/Python do not retry the HTTP POST.
- `create_app(settings?, model?) -> FastAPI` supports ordinary dependency injection for offline tests.

### Task 1: Private FastAPI contracts, five tools and bounded retrieval

**Files:** Create `agent-service/{pyproject.toml,uv.lock,.env.example}`, `app/{__init__,config,main}.py`, `app/review/{__init__,routes,schemas,tools,retrieval}.py`, `tests/{conftest,test_api,test_tools}.py`, safe fixture `docs/contracts/prism-agent-v1/request.json`. Update `.gitignore` for Python caches/venv only.
**Produces:** strict request/decision/result models; `execute_tool(request, name, arguments) -> dict`; `rank_sources(sources, query, k) -> list[Source]`; authenticated `POST /v1/reviews` boundary.

- [x] Write API/tool tests: unauthorized request rejected; foreign/extra scope/path denied; wrong old-side revision rejected; line bounds and 256 KiB limit; lexical match returns trusted IDs; missing tests return no-match; all five tools usable.
- [x] Run `uv run --project agent-service pytest agent-service/tests/test_tools.py agent-service/tests/test_api.py -q`; observe missing behavior fail before implementing.
- [x] Implement plain functions, strict Pydantic models and app factory with lifespan/bootstrap. No provider request until task 2; injected runner can return a safe unavailable result.
- [x] Run whole Python suite and Ruff; record exact results and package/interpreter versions.

### Task 2: Bounded LangGraph and Gemini adapter

**Files:** Create `app/review/{graph,model,validation}.py`, `tests/{test_graph,test_validation,test_model}.py` inside `agent-service`. Wire route to graph.
**Consumes:** Task 1 contracts/tools. **Produces:** `run_review(request, model, settings) -> AgentResponse`; injectable `model.decide(...)` / `model.draft(...)` with per-attempt usage. `validate_output(output, request, selected_sources) -> normalized result`.

- [x] Test distinct scripted decisions select different useful tools; final evidence exactly matches changed lines; missing/foreign/old-side evidence rejected; walkthrough covers all supplied files.
- [x] Test stop on repeated tools, invalid JSON/args, exhausted 2/4/3 budgets and deadlines; reserve final call; explicit 429 retry shares budget; timeout/ambiguous transport not retried. Run and observe RED.
- [x] Implement typed dictionary state and small graph nodes. Gemini native structured JSON, explicit key/backend/model, SDK retries/tracing off; capture usage without raw messages.
- [x] Run all Python tests, lint/static checks. Offline fake provider verifies logic, not live model quality.

### Task 3: Reuse Node queue/checkpoints with the Python engine

**Files:** Create `server/src/features/ai/ai.agent.js`, test `server/test/ai.agent.test.js`; modify `analysis.{jobs,service,repository,model}.js`, `pullRequest.service.js`, `server/.env.example`; extend webhook/workflow tests.
**Produces:** `getReviewEngine()`, `runAgentAnalysis(pullRequest, {id,installationId,ruleFindings,...})`; persisted `options.reviewEngine`; owner-checked `markReviewJobUnknown(id, owner, code)`; bounded related-test enrichment.

- [x] Test strict private endpoint policy, scope/result validation, safe request prep and no secret forwarding. Lost response issues one POST and raises interrupted request; no fallback. Observe RED.
- [x] Test existing jobs remain legacy after config change; agent job selection survives resume; one Mongo claim wins; unknown outcome not marked completed; old/incremental/test context shares existing budgets. Observe RED.
- [x] Wire Python call into existing Node graph's review callback; reuse shared save/rules/evidence validators. Preserve legacy behavior and suppress automatic agent GitHub writes.
- [x] Run `npm test --prefix server`; separately run real local FastAPI HTTP fixture contract and isolated Mongo/Azurite duplicate/restart checks when available. Record skipped/unavailable integrations honestly.

### Task 4: Visible agent activity in the existing report

**Files:** Create `client/src/features/dashboard/report/AgentActivity.jsx`; modify `AiStatusPanel.jsx`, `AnalysisReport.jsx`, feature-owned report CSS and client tests.
**Produces:** Accessible metadata-only activity view with tool/source refs, outcome/time, usage and stop reason.

- [x] Add rendering/API fixtures for completed/partial/unavailable agent results, malformed optional metadata and narrow screen layout; observe RED.
- [x] Implement small reusable component; preserve diff navigation and GitHub Dark theme. Label scripted/recorded/live provenance; do not expose prompts or reasoning.
- [x] Run client tests/build and local browser desktop/mobile, keyboard and evidence navigation checks.

### Task 5: Human-approved GitHub summary

**Files:** Create `server/src/features/analysis/analysis.publication.js`, corresponding Node tests and `ReviewApproval.jsx`; modify analysis schema/repository/routes, GitHub adapter, client API/CSS/tests.
**Interfaces:** `POST /api/analyses/:id/publication` accepts only `{decision:'approve'|'reject'}`; existing session/origin guards apply. Server derives fixed preview; `publishApprovedSummary(report, auth)` checks fresh write access/open PR/revisions and atomically claims pending publication.

- [x] Tests deny foreign read/write, stale/revoked access and arbitrary client body; simultaneous approve causes one external write; rejected/unknown cannot silently republish; uncertain write never blindly retries. Observe RED.
- [x] Implement one report subdocument, stable bot marker, bounded post/reconciliation and safe outcome; leave legacy default delivery intact.
- [x] Add preview/approve/reject/status UI; test loading/errors/double click; rerun Node/client suites and browser checks with mocked GitHub writes.

### Task 6: Evaluation and per-attempt usage/cost

**Files:** Create `agent-service/app/review/evaluation.py`, `agent-service/tests/test_evaluation.py`, owned agent evaluation cases/judgment template under `docs/beta/`; extend activity diagnostics and docs.
**Produces:** offline runner/scorer that separates scripted transport results from human-adjudicated model quality; usage/cost estimates are dated/configured, never fabricated.

- [x] Tests keep precision/recall null without judgments, reject stale/duplicate labels, preserve null usage/prices and count all attempts; compare same scoped cases. Observe RED.
- [x] Add frozen context-dependent/injection/missing-context cases, simple judgment worksheet and documented offline/live opt-in commands.
- [x] Run offline evaluation and all suites; record actual tool decisions/stop outcomes. Do not call paid models by default.

### Task 7: Docker, Azure configuration, README and final verification

**Files:** Create `agent-service/Dockerfile`, local demo instructions/compose if useful, `scripts/verify-local.ps1`; modify `infra/main.bicep`, README, `docs/FEATURE_ROADMAP.md`, architecture docs and environment examples.
**Produces:** reproducible local demo, optional internal scale-to-zero service config, explicit legacy rollback and verification ledger. No actual deployment implied.

- [x] Verify local container health/auth and real Node-to-Python HTTP with owned fixture; configure internal ingress/separate secret refs, min0/max1, explicit provider/model/engine selection.
- [x] Run Python suite/lint, full Node/client/scorer suites, build and isolated integration; inspect Bicep and Docker builds. Record unavailable daemon/tools honestly and resolve feasible blockers.
- [x] Browser-check real local agent fixture/report and approval UI at desktop/mobile; keep fake model/write boundaries visible. Do not conflate it with a live provider.
- [x] Update technical README/diagram, simple learning walkthrough and 12-point evidence matrix. Perform fresh-context whole-change review; fix material findings and rerun affected checks.
- [x] Audit every spec requirement against current files/runtime/test evidence; keep goal active until all required work is complete. Leave changes uncommitted for owner review.

## Execution ledger

Use `tmp/agent-implementation/progress.md` to record task states, red/green command evidence, rulings and next action. Preserve unrelated `tmp/pdfs` artifacts. Plan self-review completed: all 12 points and five failure classes map to tasks; no Python persistence added; commit/deploy prohibited absent request.
