# PRism AI — current features and next work

Updated **17 November 2026**. This is the single feature backlog. [README](../README.md) = setup and dated live verification; [cheatsheet](FEATURE_CHEATSHEET.md) = beginner explanations; [evaluation guide](beta/DEMO_AND_EVALUATION.md) = quality checks; [historical ledger](superpowers/plans/2026-10-31-pr-workflow-polish.md) = past chunks/failures.

**Goal:** a clean, interview-explainable AI full-stack demo. LangChain, LangGraph and ChromaDB are now required learning features, not optional keywords. LangChain providers, bounded Chroma RAG and Mongo-backed LangGraph checkpoints are implemented; external acceptance remains separate. Extend one existing review pipeline; do not build a parallel advanced app.

## Core PR loop delivery — 17 November

User authorized plan-first autonomous implementation with small local commits and beginner-readable code. [Implementation plan](superpowers/plans/2026-11-16-core-review-workflow.md). Scope: the core GitHub PR-review loop, not the entire CodeRabbit commercial product. No new runtime dependency or hosted resource.

| Added capability | Existing module / boundary |
| --- | --- |
| Repository policy + path guidelines | New small `review.policy.js`; strict optional base-SHA `.prism.json`, literal ignored paths, bounded instructions, visible exclusions. Opt-in environment switch; no contributor-controlled self-disable |
| Incremental review | Existing fetch/repository/service compare a compatible successful prior head; same installation/PR/base and proven ancestor. Uncertain/incomplete compare falls back full. Store actual patch and `diffBaseSha`; UI labels scope |
| GitHub inline findings | Existing GitHub module, opt-in max five unique validated AI findings, current-head/full-PR-diff recheck, COMMENT only; rules/unmappable/stale evidence omitted |
| PR commands + pause | New small `review.controls.js`, existing signed webhook/queue. Exact help/review/full review/pause/resume/summary; fresh write permission. Persistent Mongo control scoped per PR, monotonic comment IDs; queued work rechecks pause |
| Advisory GitHub status | Existing GitHub module, opt-in commit status with separate write-token permissions. Completed AI can succeed; partial/unavailable remains error, never merge approval |

Command identity is independent of changing head SHAs, so redelivering a comment after another push does not create another paid run. Existing completed report IDs are reused before inference/status changes. Reviews, annotations, RAG, MCP, summaries/walkthroughs, email and queue all reuse the existing pipeline. Pause does not cancel already-running inference. Cross-process ambiguous notification delivery is not exactly-once; no distributed outbound lock was added for this small demo.

Verification: full offline backend suite **165 passed, 1 opt-in integration skipped**, frontend **41 passed**, production build passed. Separately enabled real MongoDB/Azurite test **1 passed**, including atomic pause ordering, paused queued work and pause/checkpoint recovery in another Node process. GitHub/model calls in new feature tests are mocked. RED/GREEN regressions caught command replay, completed-report replay/status, inline lock ownership, duplicate inline findings and optional write-permission leakage. No new live provider, GitHub write, email, hosted CI or deployment verification is claimed. Final recheck passed. Commits: `907a9e0` reliability, `ebe174b` policy, `87ec343` incremental, `61236ba` inline/status, `3a093b9` commands, `cb94864` replay/permission hardening. Seven existing Python evaluation tests also passed.

Owner setup remains: enable the desired default-off flags and **Issue comment** subscription, grant optional Commit statuses write only if enabling status. Follow [README setup](../README.md#core-pr-review-controls--17-november), then test one real authorized PR command/inline review. Existing Gemini intermittent upstream failures and human quality evaluation remain unresolved.

Intentionally outside this core slice: unrestricted conversational agents, sandboxed contributor-code execution, auto-fix/auto-merge, IDE extensions, complete static-analysis toolchains and enterprise dashboards. Existing deterministic risk signals are not full SAST; no complete dependency graph or commercial parity claim.

## CodeRabbit comparison — 16 November (historical baseline)

Sources: [public architecture](https://docs.coderabbit.ai/overview/architecture), [context engineering](https://www.coderabbit.ai/blog/the-art-and-science-of-context-engineering), [review lifecycle](https://docs.coderabbit.ai/guides/code-review-overview). This compares documented capabilities; exact internal prompts, retry/fallback policies and infrastructure are not established by these sources.

| Area | CodeRabbit describes | Prism today / implication |
| --- | --- | --- |
| Context | Repository exploration, code graph, intent and guidelines | PR metadata, pinned windows/direct imports, optional docs/Chroma. Bounded retrieval is not a complete dependency graph |
| Verification | Specialized verification agents | Exact evidence/schema checks. A matching line does not prove a finding's reasoning; human-labelled cases remain necessary |
| Incremental reviews | Changes since the previous review | Previously revision deduplication only; 17 November adds compatible previous-head comparison with full fallback and explicit scope |
| Static analysis | Sandboxed repository analysis with linters/SAST | Keyword/path heuristics only; keep their signals distinct from confirmed bugs. No untrusted repository execution |
| Review generation | Specialized agents and context-dependent prompts/models | One bounded call generates findings and narrative together. Splitting work may isolate failures but costs more calls; not proven to fix our 5-line fixture |
| Reliability | Public pages do not establish an exact retry policy | Keep timeouts, transport errors, provider JSON rejection and local evidence rejection separate. Do not copy an assumed fallback design |

**Immediate fix:** Groq HTTP 400 `json_validate_failed` now becomes `INVALID_RESPONSE` / response failure, retaining HTTP status and one-attempt diagnostics without storing `failed_generation`. Other HTTP 400 errors retain their provider classification. Regression reproduced before the fix; 104 focused offline checks passed afterward. No live calls were made for this comparison.

**Reliability slice:** added opt-in `AI_MAX_RETRIES=1`: at most one same-provider retry for returned 502/503/504 or known Groq JSON-generation rejection, sharing the original timeout. Auth/quota failures, ordinary 400s, local invalid evidence and ambiguous client timeouts do not retry. Actual attempts/retry reason persist and display; failed generation text stays private. Default remains zero; local owner configuration opts in. This is our bounded demo policy, not a claim about CodeRabbit's private retry implementation.

**Controlled contract experiment:** four Groq requests on two owned fixtures, with retries disabled. Current combined contract: buggy average rejected with HTTP 400; clean add completed with zero findings. Experimental flat contract: buggy average completed with a supported finding; clean add completed but produced an unsupported generic validation finding. Flat output was normalized only in the throwaway experiment and was **not adopted**. Two cases do not establish a quality score, failure rate or latency improvement.

**Verification after the slice:** 149 backend checks passed, one opt-in external integration skipped; 41 frontend checks and production build passed. New real PR #3 service report `781c14a3-fdc3-4da1-a32e-e867036642b2` completed with Groq in one attempt (model: 3.6 seconds) and was read back from MongoDB. A signed event replay through the real HTTP handler, GitHub App credentials, live Groq and an isolated MongoDB database completed in 8.7 seconds; duplicate replay retained one report/run. The temporary database was removed. These were signed local replays, not a fresh GitHub commit delivery. Retry recovery was exercised offline; no live retry recovery or sustained availability is claimed.

**Next acceptance:** measure supported/duplicate/incorrect findings on labelled cases and validate the newly implemented core loop live after App setup. No agent swarm, full clone/sandbox or extra hosted infrastructure is needed for this demo. CodeRabbit-style context work does not itself resolve Gemini's upstream 503/504 responses.

## Implemented today

Implemented means code exists; it does not mean every external integration passed live acceptance.

| Feature | Existing implementation | Verification boundary |
| --- | --- | --- |
| PR retrieval + diff | GitHub metadata/paginated patches, base/head revision guards, old/new evidence navigation, renamed/missing/binary file handling | Bounded snapshots; no repository execution or complete dependency graph |
| Context + basic RAG pattern | Revision-pinned source windows, selected direct JS/TS imports, opt-in lexical README/CONTRIBUTING chunks with source coordinates | Optional Chroma: sanitized chunks, persistent vectors and top-4 semantic retrieval; local live test passed, hosted store pending |
| AI review + rules | LangChain Gemini/Mistral/xAI/Groq adapters with native JSON schema, structured summary/walkthrough/impacts/findings; deterministic risk signals; evidence/schema validation | Failed AI is unavailable, never a successful clean review; evidence match does not prove reasoning. Live Groq successes and schema-generation failures both observed |
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

1. **Review reliability:** GitHub App registration/install/login and one real bot summary are now verified. Diagnose provider timeouts and invalid structured output separately; retain strict evidence checks and recorded failures. Verify two-account access and repo removal; resolve Mistral 429 only if using that provider.
2. **Quality:** human-label dev results, compare providers/context on identical fixtures; keep held-out cases untouched.
3. **Optional external acceptance:** Langfuse ingestion, opted-in SMTP/PR comment, desktop MCP and browser checks.
4. **Hosting last:** settle persistent Chroma cost/retention or leave semantic retrieval off; then Azure queue/worker/OIDC and end-to-end acceptance. INR200/month remains a target, not a guaranteed cap.

Core code slices are implemented. Remaining items need external setup/human acceptance; another framework layer is not needed.

Prefer existing files; a new module is justified only for a distinct responsibility. Plain JavaScript can use these libraries; no TypeScript rewrite, agent swarm, Kubernetes, repository execution or auto-merge required. Short comments explain non-obvious choices.

## Manual acceptance still open

- Repo removal, second-account isolation and a fresh post-Groq-switch commit event (the automated test commit was denied with GitHub 403).
- Actual SMTP delivery after explicit opt-in and sender setup. A real PR summary and duplicate-comment prevention passed on 16 November.
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
