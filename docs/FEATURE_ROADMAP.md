# PRism AI — current features and next work

Updated **14 November 2026**. This is the single feature backlog. [README](../README.md) = setup; [cheatsheet](FEATURE_CHEATSHEET.md) = beginner explanations; [evaluation guide](beta/DEMO_AND_EVALUATION.md) = quality checks; [historical ledger](superpowers/plans/2026-10-31-pr-workflow-polish.md) = past chunks/failures.

**Goal:** a clean, interview-explainable AI full-stack demo. LangChain, LangGraph and ChromaDB are now required learning features, not optional keywords. LangChain providers, bounded Chroma RAG and Mongo-backed LangGraph checkpoints are implemented; external acceptance remains separate. Extend one existing review pipeline; do not build a parallel advanced app.

## Implemented today

Implemented means code exists; it does not mean every external integration passed live acceptance.

| Feature | Existing implementation | Verification boundary |
| --- | --- | --- |
| PR retrieval + diff | GitHub metadata/paginated patches, base/head revision guards, old/new evidence navigation, renamed/missing/binary file handling | Bounded snapshots; no repository execution or complete dependency graph |
| Context + basic RAG pattern | Revision-pinned source windows, selected direct JS/TS imports, opt-in lexical README/CONTRIBUTING chunks with source coordinates | Optional Chroma: sanitized chunks, persistent vectors and top-4 semantic retrieval; local live test passed, hosted store pending |
| AI review + rules | LangChain Gemini/Mistral/xAI adapters with native JSON schema, structured summary/walkthrough/impacts/findings; deterministic risk signals; evidence/schema validation | Failed AI is unavailable, never a successful clean review; evidence match does not prove reasoning |
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
| Docker + CI/CD | Same web/worker image; offline suites/build/container demo smoke; manual integration-only GHCR/Azure OIDC deployment gate | Local container verified; hosted Actions/OIDC/deployment unverified; real Mongo/Azurite/restart integration test added to CI and passed locally |
| Evaluation | Frozen 12 dev / 4 held-out synthetic cases, Node collector, Python scorer, separate retrieval experiment | Human judgments/full benchmark pending; no accuracy percentage claimed |

## Comparison: new request versus existing features

One row = one responsibility. Shared concepts below are extensions, not another feature/system to build twice.

| Requested skill | Already here | What remains to implement once | Decision |
| --- | --- | --- | --- |
| LangChain + providers | Gemini ChatGoogle, Mistral ChatMistralAI, xAI via OpenAI-compatible adapter; one selected provider | Mistral quota and Grok live credentials/testing | No fallback/fan-out; OpenAI API not integrated |
| Chroma RAG | Sanitized bounded chunks, Gemini embeddings, persistent vectors, scoped collections, top-4 trusted results | Hosted retention/cost and human relevance evaluation | Optional; fallback to source context on failure |
| LangGraph + checkpoints | context -> request boundary -> model -> persist; scoped Mongo state with 24-hour TTL | Hosted restart acceptance | Failed save resumes; unknown model outcomes/missing checkpoints block replay |
| Feedback memory | Same-PR/installation useful hints pass through transient review input | Human usefulness evaluation | Reused; not training or another memory database |
| Langfuse | Metadata-only stages/model/provider/tokens | Actual ingestion account verification | No raw prompt export |
| Attribution/evaluation | UI/report/collector retain actual provider/model | Human-adjudicated comparisons | Generation success is not accuracy |
| MCP | Scoped official SDK local stdio tools and captured demo | Desktop acceptance; optional remote product | Existing MCP reused |
| Connect/queue/email | Existing modules plus real Mongo/Azurite/new-process integration test | Account/SMTP/browser/Azure acceptance | No duplicate engines |

**Memory distinction:** graph state = this run's working data; checkpoint = saved progress for that run; feedback memory = selected prior-review hints. Keep all scoped. Resume must not blindly repeat an AI request whose result is unknown or send duplicate comments/emails.

## Ordered next work

Each chunk: inspect existing path -> meaningful regression/check -> small implementation -> verify -> commit. Framework status is explicit: the docs cleanup installed nothing; a later verified Gemini chunk implemented LangChain.

1. **Owner setup:** register/install/connect GitHub App; add xAI key/model if desired; resolve Mistral 429. Verify two-account access and repo removal.
2. **Quality:** human-label dev results, compare providers/context on identical fixtures; keep held-out cases untouched.
3. **Optional external acceptance:** Langfuse ingestion, opted-in SMTP/PR comment, desktop MCP and browser checks.
4. **Hosting last:** settle persistent Chroma cost/retention or leave semantic retrieval off; then Azure queue/worker/OIDC and end-to-end acceptance. INR200/month remains a target, not a guaranteed cap.

Core code slices are implemented. Remaining items need external setup/human acceptance; another framework layer is not needed.

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

## Latest chunk — LangChain Gemini integration

Existing `ai.service.js` now uses `ChatGoogle` from `@langchain/google/node` for review and connectivity. `@langchain/core` is its required peer; explicit `langsmith` dependency scopes automatic LangSmith tracing off. The metadata-only Langfuse exporter is unchanged. Ambient verbose console logging fails closed (`UNSAFE_LOGGING`); keep `LANGCHAIN_VERBOSE` unset/false. Native response schema and existing file/line/evidence validators remain; no agent/tool loop added. Direct `@google/genai` stays for the separate embedding experiment.

`maxRetries=0`, abort deadline, server timeout, output budget and low thinking are explicit. A small API-client hook reads original usage counts because the LangChain message normalizes missing usage to zero and includes thinking in output. Missing counts remain null; no raw response/prompt is persisted by this adapter.

Verified this chunk: actual LangChain-call regression RED/GREEN, **134 backend tests passed**, production dependency audit zero findings. Live B01 completed in 9,352 ms, one finding/walkthrough, 465 input / 500 output / 965 total tokens,thinking unknown, attempts 1, run 16e60aae-5a91-4a2f-ae97-56c18382b430. This synthetic call is not full GitHub acceptance or a reliability guarantee. Docker/review verification is recorded in the ledger. This historical Gemini-only chunk was followed by the extensions below.

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


## Framework verification — 14 November

- Mongo checkpoints: separate Node process resumed a failed save without another model callback. TTL index: 86,400 seconds. Real Azurite duplicates invoked analysis once. Local memory fallback cannot recover across process restarts.
- Real Chroma + Gemini embeddings: two chunks indexed; repeat retrieval reused vectors (2 embedding calls first, 1 query call later). Installation/repository/revisions/model scope the collection. Hosted Chroma remains unverified.
- Live Gemini B01: diff-only **5,938 ms**, bounded-semantic **4,702 ms**; one validated finding and one attempt each; input 852/1,025 characters. No quality/speed improvement or large-context timeout cause is proven by these tiny fixtures.
- Live Mistral: **429 in 1,399 ms**, one attempt, no retry/fallback. xAI key missing; Grok live acceptance pending.
- Only two new runtime modules: `ai.retrieval.js` (persistent semantic search), `analysis.workflow.js` (state/checkpoints). Existing services, context, repository, worker, UI and collector were extended.

Final checks after independent review fixes: **144 backend passed + 1 separately passing opt-in Mongo/Azurite integration**, **41 frontend**, **7 Python**, production build and zero production dependency-audit findings. Resume prerequisite failures preserve recoverable IDs; unsupported provider settings preserve deterministic reports. Docker/sample smoke is recorded in the ledger. Hosted acceptance stays open.
