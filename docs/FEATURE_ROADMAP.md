# PRism AI — current features and next work

Updated **14 November 2026**. This is the single feature backlog. [README](../README.md) = setup; [cheatsheet](FEATURE_CHEATSHEET.md) = beginner explanations; [evaluation guide](beta/DEMO_AND_EVALUATION.md) = quality checks; [historical ledger](superpowers/plans/2026-10-31-pr-workflow-polish.md) = past chunks/failures.

**Goal:** a clean, interview-explainable AI full-stack demo. LangChain, LangGraph and ChromaDB are now required learning features, not optional keywords. They are **planned, not implemented**. Extend one existing review pipeline; do not build a parallel advanced app.

## Implemented today

Implemented means code exists; it does not mean every external integration passed live acceptance.

| Feature | Existing implementation | Verification boundary |
| --- | --- | --- |
| PR retrieval + diff | GitHub metadata/paginated patches, base/head revision guards, old/new evidence navigation, renamed/missing/binary file handling | Bounded snapshots; no repository execution or complete dependency graph |
| Context + basic RAG pattern | Revision-pinned source windows, selected direct JS/TS imports, opt-in lexical README/CONTRIBUTING chunks with source coordinates | No persistent vectors or production semantic retriever |
| AI review + rules | Direct Gemini SDK, structured summary/walkthrough/impacts/findings; deterministic risk signals; evidence/schema validation | Failed AI is unavailable, never a successful clean review; evidence match does not prove reasoning |
| Saved reports + feedback | MongoDB reports/revisions; Useful/Incorrect annotations with actor identity and optional reason | Local fallback is volatile; production storage fails closed |
| Previous-review memory | At most three relevant useful-labelled hints from another revision of the same PR/installation | Existing memory, not training or cross-repository chat memory |
| Progress + diagnostics | Actual NDJSON stages, time, run/prompt/schema versions, serialized input size and provider token usage when reported | No fixed response-time promise; unknown token counts stay unknown |
| Tracing | Local stage timing and optional metadata-only Langfuse OTLP export | Actual Langfuse ingestion still needs account setup/verification |
| GitHub Connect + access | App install/login routes, OAuth state/PKCE, encrypted expiring MongoDB sessions, fresh installation/repo checks | Real App registration/install/login and second-account acceptance pending |
| Automatic webhook reviews | Signed payload validation; selected PR actions; revision-based deduplication | 202 means accepted, not reviewed; draft/closed/irrelevant events ignored |
| Durable jobs | MongoDB job/status/owner + ID-only Azure queue message; one-shot worker; failed/unknown outcomes | Local Azurite/Mongo/container checks recorded; live Azure trigger pending |
| Notification delivery | Default-off advisory App summary/link; opt-in SMTP to connected user's verified GitHub email | Actual comment/SMTP delivery pending; email authorization expires with session/logout |
| Usage controls | Persistent actor/installation/hour and global hour/month counters; default 100 review starts/month | Starts are not token/currency billing caps |
| MCP | Official SDK local stdio list/read tools; database-free captured-demo tool | Not a remote authenticated connector or a public registry listing |
| Public sample + UI | Dark/orange landing, routes, feature-card interactions, `/demo`, report/history/diff/feedback states | Recorded sample, not new inference; browser visual/mobile QA pending |
| Docker + CI/CD | Same web/worker image; offline suites/build/container demo smoke; manual integration-only GHCR/Azure OIDC deployment gate | Local container verified; hosted Actions/OIDC/deployment unverified; real queue integration absent from CI |
| Evaluation | Frozen 12 dev / 4 held-out synthetic cases, Node collector, Python scorer, separate retrieval experiment | Human judgments/full benchmark pending; no accuracy percentage claimed |

## Comparison: new request versus existing features

One row = one responsibility. Shared concepts below are extensions, not another feature/system to build twice.

| Requested skill | Already here | What remains to implement once | Decision |
| --- | --- | --- | --- |
| LangChain + provider orchestration | Direct Gemini call and common evidence validators | Common model-call integration for Gemini, Mistral and Grok; normalize results into existing report contract | Required migration; reuse validator/context, no separate review engine |
| RAG | Keyword-based docs retrieval plus source/import context | Connect semantic retrieval to the same bounded context preparation | Extend current RAG pattern; do not count keyword RAG and vector RAG as two apps |
| ChromaDB + embeddings | Small embedding/cosine comparison experiment only | Store/query bounded code/docs chunks with repository, installation, revision, path and line metadata; isolate scopes and handle stale revisions | Required persistent semantic retrieval; Chroma owns vectors, Mongo owns reports/jobs |
| LangGraph | Explicit service steps and failure branches | Express fetch/retrieve/review/validate/save using small named graph nodes and explicit validated state | Required orchestration of the same workflow; graph does not replace queue delivery |
| State memory/checkpoints | Temporary request state and durable job status | Persist scoped graph checkpoints and expose safe interrupted-run behavior | Required extension; a job row is not a graph checkpoint |
| Previous version/feedback memory | Scoped useful feedback already enters the next review | Pass existing memory through graph/retriever boundaries without duplicating storage | Keep/enhance existing feature, not a second memory service |
| Langfuse latency/tokens/tracing | Existing metadata exporter and UI diagnostics | Verify real ingestion; preserve per-provider usage/model/attempt metadata | Verification/provider extension, not a new tracing stack |
| Multi-provider attribution | Report has Gemini model metadata | Save actual provider/model and show “Reviewed by …”; compare providers on identical labelled cases | Required with provider integration; no fake attribution or all-provider call fan-out |
| MCP/plugin | Scoped local SDK server implemented | Desktop acceptance pending; remote auth/registry is a separate optional future product | Keep existing MCP; frameworks do not require rebuilding it |
| GitHub Connect, queue, email | Existing modules above | Live account acceptance, queue CI coverage and simpler packaging | Finish/verify; do not recreate these features for LangGraph |

**Memory distinction:** graph state = this run's working data; checkpoint = saved progress for that run; feedback memory = selected prior-review hints. Keep all scoped. Resume must not blindly repeat an AI request whose result is unknown or send duplicate comments/emails.

## Ordered next work

Each chunk: inspect existing path -> meaningful regression/check -> small implementation -> verify -> commit. This documentation cleanup does not implement any framework.

1. **P0 — baseline cleanup and CI confidence.** Remove unused server `prism-ai: file:..` dependency after checking packaging; align documented/default model configuration; add actual Mongo/queue/worker integration coverage to CI. Retain tests before build/deploy and the public sample. Audit simpler hosting options without deleting crash protection blindly.
2. **P1 — LangChain + multi-provider calls.** Extend `ai.service.js`, existing model/service and provider tests. Start with one selected provider per review, bounded deadline, common schema/evidence checks and honest provider/token/error metadata. Add Mistral/Grok credentials only server-side. No automatic generation retries or fallback until explicitly designed; OpenAI is not an approved additional integration yet.
3. **P1 — ChromaDB semantic RAG.** Extend existing context/retrieval functions; embed a small bounded collection, persist chunks and query only the authorized repo/revision. Preserve original code coordinates, input budgets and sensitive-content filtering. Record retrieval provenance and a small relevance comparison. Chroma runtime/persistence/hosting cost must be settled before enabling it on the live demo; no claim it fits INR200 yet.
4. **P1 — LangGraph + persistent state.** Wrap existing workflow functions as readable nodes. Reuse MongoDB for scoped checkpoints where supported and keep queue/lease protection separate. Test state transitions, safe failure, restart read-back and explicit handling of unknown model outcomes. Checkpoints are not permission to automatically rerun inference or side effects.
5. **P1 — integrate memory and observability.** Route existing feedback hints through graph state, retain current-evidence validation, trace actual node/provider timing and verify configured Langfuse ingestion. No training, generic chat memory or second logging service.
6. **P1 — compare usefulness.** Reuse frozen cases/scorer for controlled provider/RAG comparisons; human-adjudicate findings. Separate successful generation, retrieval relevance and bug-detection quality. Held-out data stays out of tuning.
7. **P0 release gate — owner acceptance then Azure.** Connect/install -> PR event -> accepted job -> one review -> authorized saved report -> opted-in notification. Replay, restart, failure, revoked access and second-account cases must be exercised before claiming the hosted release works.

Prefer existing files; a new module is justified only for a distinct responsibility. Plain JavaScript can use these libraries; no TypeScript rewrite, agent swarm, Kubernetes, repository execution or auto-merge required. Short comments explain non-obvious choices.

## Manual acceptance still open

- GitHub App registration/credentials, real installation/login, repo removal and second-account isolation.
- Actual optional PR comment and SMTP delivery after explicit opt-in; provider/sender setup.
- Real Langfuse ingestion, compatible desktop MCP setup and browser/mobile interaction QA.
- Human evaluation and a project-license decision.
- Hosted CI/OIDC, Azure queue/identity/scaler/job setup, HTTPS and deployment; no public URL verified.

Follow [owner setup](../README.md#release-setup--13-november). No cloud resources, real emails or provider calls were made during this docs-only cleanup.

## Runtime and budget boundaries

- Last inspected local `.env` on 14 November: inline execution, queue not configured. Production webhook code requires queue execution. This is a dated configuration observation, not proof of a running deployment.
- Queue path: save Mongo job -> send ID -> return 202 -> worker claims job -> review/save -> record result. Inline path acknowledges before running in the API process and can lose unfinished work on restart. A queue/lease cannot promise exactly-once model execution after an ambiguous crash; interrupted runs become unknown on redelivery after lease expiry.
- GitHub files endpoint cap 3,000; report snapshot 4 MiB; model context up to 5 reviewable files, 12k serialized diff characters and 8k snippet characters. Preserve bounded inputs through migrations.
- Budget target **INR200/month for the whole demo**, not an allowance to consume or a guaranteed hard cap. Student credit is finite; provider quotas and consumer subscriptions are separate. Recheck regional pricing and Chroma hosting before provisioning.
- Intended Azure shape: scale-to-zero Consumption web + queue-triggered one-shot job, same image, MongoDB persistence, managed queue identity and bounded parallelism/logs. This is proposed hosting, not a deployed architecture. Alerts notify; they do not cap bills.
- No main merge, public image publication or deployment implied by local commits.

## Recorded verification, not new test claims

- **13 November:** 130 backend / 40 frontend / 7 Python checks and production image checks passed. Isolated Mongo verified encrypted persistence/atomic quotas; Azurite duplicate messages invoked analysis once; container worker reused a saved report. Independent review found a mail-authorization lifetime issue; fixed with RED/GREEN regression. Runtime audit reported zero vulnerabilities then, with two moderate dev-only advisories. These results have not been rerun by this documentation edit.
- **14 November audit:** configured Gemini 3.6 connectivity succeeded; B01 existing review function completed in 5,617 ms, one finding/walkthrough, 466 input / 497 output / 963 total tokens, one attempt; run 9188a9a7-dd4e-41f0-89ea-2d4020d693c1. Synthetic supplied-context call, not a fresh full GitHub PR acceptance or uptime guarantee.
- Separate earlier small requests returned503/504, including a 966-byte PR input. Success does not resolve intermittent provider availability; timeout inflation/framework migration is not a proven fix.
- [Saved partial development artifact](beta/evaluation-live-dev.json) preserves original results plus captured demo and tiny retrieval comparison. Two live embedding batches selected the relevant document on 3/3 tiny queries for lexical and semantic methods; this is not a persistent index or measured review improvement. Judgments/full benchmark remain incomplete; no quality score claimed.

## Documentation cleanup map

Removed obsolete competing plans only after preserving useful material here or in the existing guides. Git history retains original versions.

| Removed | Replacement / why |
| --- | --- |
| PRISM_BETA_V0_REQUIREMENTS.md | Current feature/status table and operating boundaries above; old webhook/auth exclusions contradicted implemented scope |
| PRISM_BETA_V0_PLAN.md | One ordered backlog above instead of another build plan |
| phases/PHASE_1_FOUNDATION.md | Completed shell/schema/UI scope covered by current feature table |
| phases/PHASE_2_FOUNDATIONAL_ANALYSIS.md | Completed retrieval/rules/history covered above |
| phases/PHASE_3_BETA_DEMO.md | AI/evaluation requirements retained; obsolete worker/webhook deferrals removed |
| UI_DIRECTION.md | UI constraints moved to cheatsheet's UI section |
| beta/TEST_CASES.md | Four manual rule scenarios and recording instructions merged into evaluation guide; frozen AI fixtures unchanged |

Historical ledger is retained for unique failures/verification history, not as another current backlog. README remains the setup source; this roadmap remains the feature source.
