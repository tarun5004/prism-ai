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

## Session and private-access checks — 17 November

### Live Azure preflight — 17 November

CLI MFA login verified against **Azure for Students**, subscription state **Enabled**, `subscriptionPolicies.spendingLimit=On`. This protects the included credit balance; it is not a configurable INR200 monthly cap. The subscription initially had no deployed resources. Allowed regions from the actual policy: Poland Central, Malaysia West, UAE North, Indonesia Central and East Asia; Central India is not permitted. Registered `Microsoft.App` (no compute/storage provisioned); after registration East Asia reports managed-environment usage 0 of quota 1. Provider registration is complete; registration alone is not deployment or a cost guarantee.

Atlas connection was verified from a fresh local process after percent-encoding a raw `@` in the credential portion of the URI. The connection currently selects the default `test` database; verification used ping only and did not write application data. Azure outbound IP access to Atlas still needs deployment acceptance. Existing GitHub CLI login lacks package publication authorization; local GHCR upload requires a classic personal access token with `write:packages`, entered through Docker login rather than shared in chat. Requested free provider registration for `Microsoft.Storage` and `Microsoft.ManagedIdentity`; registration may finish asynchronously. Bicep compilation and `git diff --check` passed again. No cloud resource group, registry image, queue, Container App or Job was created by this preflight. Hosted Chroma and the INR200 operating-cost target remain separate acceptance items.

### Azure deployment execution — 17 November

Published Docker snapshot `ghcr.io/tarun5004/prism-ai:serverless-20261117`, digest `sha256:f95f9b6860bac75cc5970b64b29e94a7fe2b3c135873e809b81d896eee31c9e6`. This is an uncommitted working-tree snapshot, not a committed release. A container check confirmed `.env` and private deployment parameters are absent. After the owner made the package public, anonymous immutable-manifest access returned HTTP 200. No registry token was added to Azure parameters.

Azure deployment `prism-standard-release` reports **Succeeded** in resource group `prism-demo`, East Asia. Environment `prism-demo-standard-env` explicitly uses `WorkloadProfiles` mode with only the **Consumption** profile. API `prism-demo-standard-web` and Event Job `prism-demo-standard-worker` were created. Live API settings confirm min 0 / max 1 and cooldown 900 seconds; worker confirms min executions 0, max 1 per poll, 30-second polling, 600-second timeout and zero retries. Private parameters remain ignored by Git and Docker. Provisioned origin: `https://prism-demo-standard-web.proudgrass-3dd03830.eastasia.azurecontainerapps.io` — **not a healthy live application yet**.

Live corrections: ARM rejected literal log destination `'none'`, so log routing is omitted. The initial environment was actually **Express**, despite the old CLI's workload-profile arguments; live Job creation rejected it (`ExpressEnvironmentResourceNotSupported`). Bicep now uses API `2026-07-01` and explicit `environmentMode: 'WorkloadProfiles'` ([schema](https://learn.microsoft.com/en-us/azure/templates/microsoft.app/2026-07-01/managedenvironments)); default prefix matches the standard deployment. The unused Express app/environment were deleted; Mongo data and the queue were preserved. A transient storage provisioning conflict succeeded on one retry. Verified Standard_LRS account `prism7vreufg4dvamy`, queue `prism-reviews`, managed identities and queue-scoped Reader/Sender/Processor roles. Shared-key and public blob access are disabled. Student spending limit remains On; no monthly cost guarantee.

**Resolved runtime blocker:** API startup and a 15-second worker diagnostic initially failed against all three Atlas nodes (`MongooseServerSelectionError`, `ReplicaSetNoPrimary`, `ERR_SSL_TLSV1_ALERT_INTERNAL_ERROR`); the same image pinged Atlas from this PC. Owner screenshot and authenticated Atlas management inspection confirmed only the PC IP was allowed. Added all 161 current Azure outbound addresses to the correct project `6afc437d1a4128715d7d8c17`, preserving its PC entry. A transient API timeout after 103 additions was reconciled with a fresh list; the remaining 58 were added through one batch request. Verified **162 total entries, 161/161 Azure addresses covered, original PC entry preserved, no `0.0.0.0/0`**. After activation, the unchanged Azure diagnostic ping passed in **1,487 ms**. No TLS verification was disabled and no runtime timeout change was needed. This before/after test confirms missing Atlas network access was responsible for the observed cloud failure ([Atlas access lists](https://www.mongodb.com/docs/atlas/security/ip-access-list/)).

The API was temporarily deactivated during diagnosis (verified inactive, zero replicas), then reactivated after the Atlas fix. Public checks now pass: **`/api/health` HTTP 200**, **`/app` HTTP 200** with React root/assets, **`/api/github/session` HTTP 200** with `demoOnly: false`, and unauthenticated **`/api/analyses` HTTP 401**. Live API logs show MongoDB connected and server started. Normal, unmodified one-shot worker execution `prism-demo-standard-worker-lmv97ek` reports **Succeeded** against an empty queue; earlier failed diagnostic executions remain honestly recorded. GitHub App webhook config was changed from ngrok to the Azure `/api/webhooks/github` URL using its documented JWT API; PATCH and read-back each returned 200 with TLS verification enabled. No live AI, email or PR-review write was invoked. CLI Container Apps extension was installed for job log streaming; no paid logging workspace was introduced. Controlled idle acceptance baseline: **2026-11-17 14:45:17.937 UTC**, health HTTP 200; no further app HTTP traffic during the test.

Idle acceptance observed **active revision / 0 replicas / `ScaledToZero` at 15:00:41.659 UTC**, 924 seconds after the last HTTP check; the prior observation at 860 seconds still showed one replica. No manual deactivation during this test and no worker execution started during the idle interval. Actual GitHub `ping` redelivery after zero replicas then **failed its 10-second deadline (HTTP 504)**. API logs show startup at 15:02:34 UTC, after delivery began at 15:02:07 UTC. This failure is not hidden by the successful warm checks.

Focused cold-start fix plan: defer Google/LangSmith SDK imports from module evaluation to the existing model invocation functions; preserve provider request, timeout and private-tracing contracts. Add a fresh-process regression that refuses inference SDK imports during queued API startup. RED failed on `@langchain/google/node`; GREEN passed after the change. Full offline backend: **170 passed, 1 optional integration skipped, 0 failed**. Same Docker import benchmark: **19,181 ms before → 10,791 ms after at 0.25 CPU**; fixed image measured **4,019 ms at 0.5 CPU**, **1,480 ms at 1 CPU**. These are local CPU-limited import measurements, not a cloud latency guarantee.

Ruling: use **1 CPU / 2 GiB Consumption API with faster startup/readiness probes**, retaining min 0 / max 1 and final 900-second cooldown; worker resources unchanged. This raises resource usage during active/cooldown windows, not the idle minimum. No always-on tier or new service. New image `serverless-20261117-coldstart`, digest `sha256:22ebbdefcff2201fe9d72d0128b279093b6d53b8d8ceea7a28b7110de14fe0ad`. A temporary compiled test template uses a **30-second cooldown** to retest cold delivery without waiting another 15 minutes; the tracked Bicep remains **900 seconds** and must be redeployed after the experiment. No live model calls are needed for this test.

**Final experiment result:** the optimized image at 1 CPU / 2 GiB also reached zero replicas, but real GitHub `ping` redelivery again timed out at **10 seconds / HTTP 504** (15:14:00 UTC). SDK overhead was a measured contributor; removing it did **not** establish reliable cold webhook delivery. Do not report the cold-start problem as resolved or hide these attempts behind a warm retry.

**Final deployed configuration supersedes the experimental ruling:** `prism-final-serverless` deployment **Succeeded**. API is **0.5 CPU / 1 GiB, min 0 / max 1, cooldown 900 seconds**, ready revision `prism-demo-standard-web--0000002`. This retains the startup improvement at a modest active allocation; 1 CPU did not satisfy the webhook deadline, so its larger active allocation was not retained. API and worker both use the optimized digest above. Worker remains Event-triggered, **0.5 CPU / 1 GiB, min executions 0**. The temporary 30-second cooldown is **not** the final setting.

Final live checks: health **200 / status ok**, workspace HTML **200** and JS asset **200**, session **200**, unauthenticated reports **401**, OAuth start **302 to github.com with the Azure callback URL**, unsigned webhook **401**. Real **warm** GitHub `ping` delivery returned **HTTP 200 in 0.55 seconds**, targeting the Azure webhook (15:16:30 UTC). This verifies actual GitHub delivery when running, not cold reliability or a PR/model review. One additional final-image worker smoke execution was rejected by automatic approval review with only `blocked by policy`; it was **not run**. The earlier unmodified empty-queue execution passed, and final worker image/configuration were verified read-only. No live LLM calls, email or PR-review writes in this deployment acceptance.

Remaining release limitation: an initial GitHub event arriving while scaled to zero can miss GitHub's deadline and require manual redelivery; GitHub does not automatically retry that failed delivery. For a controlled demo, open the workspace before triggering a PR and inspect/redeliver failed events. Reliable unattended cold ingestion needs a separately designed fast durable ingress; do not substitute always-on compute against the owner's requirement. A new ingress must account for signature verification, payload size and the current ID-only queue contract. Actual monthly billing and final-resource 15-minute remeasurement remain unverified; the original 900-second idle run and optimized short-window zero/warm tests are separate evidence.

Manual release checklist:

- [x] Owner changed GHCR package visibility to **Public**; anonymous immutable-manifest fetch returned HTTP 200. Azure does not depend on the exposed temporary PAT.
- [x] Configure Atlas network access for verified Azure outbound connectivity. Installed official MongoDB Atlas CLI **1.60.0** with verified archive checksum; owner completed user-account login. Azure [outbound addresses can change](https://learn.microsoft.com/en-us/azure/container-apps/networking), so refresh exact entries after platform changes; this is not a fixed-egress guarantee or a paid NAT deployment.
- [x] Update GitHub webhook URL to the healthy Azure origin and read it back through the GitHub API.
- [ ] Owner: GitHub App General settings → callback URL `https://prism-demo-standard-web.proudgrass-3dd03830.eastasia.azurecontainerapps.io/api/github/callback`; setup URL `https://prism-demo-standard-web.proudgrass-3dd03830.eastasia.azurecontainerapps.io/app`. These settings are not exposed by the webhook-config API. Complete browser GitHub Connect afterward.
- [ ] Revoke the exposed GHCR PAT after publication, remove the obsolete token from local `.env`, and retain a safe future publication path.
- [x] Observe automatic idle scale-to-zero with an active revision (924 seconds in the original 900-second run); verify final cooldown restored to 900 seconds.
- [x] Verify real warm GitHub `ping` delivery; this does not close the cold-ingress failure.
- [ ] Resolve cold GitHub webhook deadline failures; retain the current evidence and avoid always-on compute as a silent workaround.
- [ ] Finish browser sign-in/authorized real PR review, event-triggered worker processing, duplicate delivery, saved report and observed-cost acceptance. No live inference or monthly bill claim follows from the transport checks.

### Approved serverless implementation plan — 17 November

Goal: 10–20 monthly review requests; Docker API scales from zero on HTTP requests and back to zero after an idle cooldown target of 900 seconds. A queue-triggered one-shot worker performs AI work and exits. Cold starts and cooldown consume resources; zero replicas do not. Database, vector storage and queue costs remain separate.

LLD: extend `analysis.jobs.js` with authenticated manual enqueue (pinned GitHub revision, stable installation/repository/revision job identity, no user token in the payload); `analysis.controller.js` returns 202 only after persistence/queue acceptance. Reuse existing worker claims/checkpoints and report authorization. Extend `analysis.api.js` and `DashboardPage.jsx` with cancellable bounded polling and a report URL that can resume after reload. Keep inline development compatibility; production must use queue execution. Add one Bicep template for Consumption API/job, queue, managed identities and secret references; managed MongoDB remains external. Chroma persistence is a separate unresolved hosting choice, not ephemeral worker storage.

- [x] API/job RED/GREEN: accepted is not completed; queue failures, unauthorized repositories, revision deduplication, token-free payload and worker replay.
- [x] UI RED/GREEN: queued/running/completed, terminal failures, malformed responses, cancellation and bounded polling without another POST.
- [x] Configure zero-minimum API, 900-second cooldown target, finite worker timeout and no idle worker executions; document local Docker release while hosted CI is deferred.
- [x] Run local backend/frontend checks and Docker acceptance; compile Bicep locally. Actual Azure cold-start, webhook deadline, scale-down and billing acceptance remain deployment checks.

Execution: focused edits in the existing checkout preserve the prior uncommitted auth fix and owner `.env.example` changes. No commit, push, registry publication or cloud provisioning in this implementation slice.

Implemented manual queue acceptance and resumable report URLs, reusing the same worker and revision identity as GitHub events. Explicit manual intent can atomically replace a queued/skipped automatic payload, but never resets running, completed, failed or uncertain inference. If the worker already claimed an automatic review that later skips, submit manually after its skipped outcome. Inference quotas are consumed only after worker claim. Review caught and fixed unrelated-report navigation/error ownership and queued automatic/manual overlap; RED/GREEN regressions and real Chromium checks exercised those paths.

Local evidence: backend **169 passed / 1 optional integration skipped**, frontend **44 passed**, Python **7 passed**. Separately enabled real MongoDB/Azurite integration **1 passed**, now including manual job persistence, revision deduplication, real report schema and pre-model skipped-job promotion. Docker image built; HTTP health/frontend/read-only sample passed; a real container worker reused a saved Mongo report, then a second execution returned empty; both exited zero without model credentials. Real Chromium exercised queued URL, reload with one POST, unrelated report navigation and error isolation using mocked APIs. Bicep compiled with no diagnostics. Logs/browser artifacts are local temporary evidence, not hosted CI or durable published artifacts. No new live model/GitHub/SMTP call, Azure deployment or observed scale-to-zero/billing claim.

GitLab identity/card verification is deferred at the owner's request; no paid service or runner setup was added. Continue local project work independently of hosted CI.

Reproduced and fixed an OAuth session-replacement bug: deleting the old browser session did not revoke its derived email authorization. The existing callback now revokes that authorization before replacing the session; saved opt-in preferences remain, and the newly connected account requires its own opt-in. No new runtime module or dependency.

Real local HTTP route tests verify two users with different installed repositories see only authorized history/reports/jobs, cannot annotate each other's reports, cannot spoof feedback identity, and lose access after repository authorization is revoked. Job responses expose only status metadata. GitHub responses are mocked and persistence uses the development memory store; this does not close live two-account or Mongo acceptance.

Verification: OAuth regression failed before the fix and passed afterward; `node --test server/test/github-app.test.js` passed **17 tests**. Full backend `node --test --test-concurrency=2` passed **166**, skipped **1 opt-in integration**, failed **0**. No live AI, GitHub write, SMTP, hosted CI or deployment was exercised in this slice.

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


### AI access failure and homepage follow-up - 17 November 2026

Design: keep the existing React landing at `/`, private workspace at `/app`, and exact-revision report URLs. Add session-aware install/connect/start/saved-report controls inside the homepage, reuse current session APIs, and return OAuth login to `/`. Do not redirect shared report links or duplicate review state. Preserve durable queue jobs, idempotency and explicit single-provider selection. Diagnose provider failures before changing the worker configuration; keep credentials only in ignored parameters and worker secrets.

Evidence and focused changes:
- PR #4 saved report `webhook-51a686f077cc3ecb61b837165c9c9aa087133aa8ddca37e1fdfc423b725206c0`: GitHub/retrieval/memory passed; Groq model failed after 589 ms with HTTP 403. The recorded job succeeded because the rule-based report was saved; this does not mean AI succeeded.
- The same Groq key/model worked locally. A read-only probe from the existing Azure API container returned 403 Forbidden even for the model-list endpoint; PC model list returned 200. This isolates a deployment-origin access denial, but the exact upstream restriction is unconfirmed. Do not label it quota or timeout. An extra diagnostic job start was automatically rejected with `blocked by policy`; that job did not run. Existing-container read-only connectivity was the safer alternative.
- Local live PR #4 review: Groq completed but missed the intended boolean bug and produced speculative invalid-argument feedback; Mistral returned HTTP 429; configured Gemini 3.6 Flash timed out at 30 seconds. No claims of those models passing review quality.
- Local live Gemini `gemini-3.1-flash-lite`: completed in 12,267 ms, one transient HTTP 503 retry (two requests total), 1,337 tokens total, validated line-7 finding for `||` versus `&&`, and evidence-backed walkthrough/impact. This is local real inference, not yet cloud end-to-end acceptance.
- Worker deployment selects Gemini Flash-Lite explicitly. New `aiMaxRetries` Bicep parameter permits only 0 or 1; default 1 shares the existing overall deadline. No silent provider fallback, paid plan upgrade, or additional infrastructure. Existing CPU/memory/minimum-zero/cooldown unchanged.
- Provider 403 now maps to `PROVIDER_ACCESS_DENIED`, category `provider`, without storing raw responses. UI also explains legacy saved `API_ERROR`/403 reports accurately.
- Home contains connection/install/review/history controls, sign-out/email preference, and a recoverable connection error. OAuth callback now returns to `/`. Direct `/app` and `/analyses/:id` bookmarks remain valid.
- RED witnessed for provider classification, callback destination and home controls; GREEN afterwards. Final offline backend: 171 passed, 1 optional integration skipped; frontend: 46 passed; client build and Bicep compilation passed. Chromium desktop and 390px mobile visual checks passed with mocked session API. A separate real Azure homepage browser load also reached the landing route without mocks.
- Published uncommitted working-tree Docker snapshot `serverless-20261117-ai-home`, digest `sha256:24cc80bd12da15855c57ab3c0af4ec8b74dfecfc66e1b5bc9baa024087d0342b`. Azure deployment `prism-ai-home-release` succeeded; ready API revision `prism-demo-standard-web--0000003`. Public health, root HTML, JS asset and session endpoints returned 200; login returned 302 to GitHub. Live bundle contains new home controls and provider-denial message. Worker configuration readback confirms Gemini 3.1 Flash-Lite, retry 1, 0.5 CPU/1 GiB, min executions 0 and final image digest. API min replicas 0/max 1/cooldown 900 preserved. Cloud inference acceptance still requires a fresh owner-triggered PR revision. No source commit/push.

Remaining: a saved failed-AI report is immutable and replaying its same revision does not invoke another model. Use a new test PR revision for post-release end-to-end acceptance; never delete saved reports/checkpoints to force a retry. Cold GitHub webhook ten-second delivery limitation remains separate and unresolved.


Region diagnosis and migration follow-up:
- Owner explicitly authorized the assistant to make the isolated test commit/push. PR #4 branch `live_prismai_test` received commit `4b0dff028f9711b724b8e7a4b2ce579313b1062a`, containing only a harmless comment in `review-policy-demo.js`. A temporary Git index preserved all unrelated local changes.
- GitHub -> durable queue -> automatic Azure execution `prism-demo-standard-worker-wkqdb` completed; new saved report `webhook-f58b688459e4fde05ec0db27399cf97994f81a60071e41ac4325d052037db0e0` still had AI unavailable: Gemini HTTP 400 after 611 ms, one attempt, no usage. Worker process success alone is not AI success.
- Official Gemini API region list (https://ai.google.dev/gemini-api/docs/available-regions) includes Malaysia but not Hong Kong. The rapid cloud-only 400 is consistent with a regional restriction; the raw error body was not retained, so its exact reason is not confirmed. Local inference success remains separate.
- An attempted second Consumption environment for the worker in Malaysia failed preflight with `MaxNumberOfGlobalEnvironmentsInSubExceeded`: subscription allows only one environment globally. No second environment was provisioned.
- Chosen migration: move the single stateless API/worker environment to Malaysia West; preserve East Asia storage, queue and managed identities via `statefulLocation`. This changes the public hostname and requires a manual GitHub callback/setup update. No paid quota or plan upgrade requested. Regional Malaysia usage query showed environment limit 1 and usage 0. Old jobs had no running executions before compute removal.
- Migration in progress; old API/job/environment removed with exact resource/region checks. MongoDB data, queue and identities untouched. Final Malaysia deployment, Atlas IP synchronization and live AI acceptance pending.


Malaysia rollout status:
- Old environment deletion completed after an asynchronous platform cleanup. New environment `prism-demo-malaysia-env` in Malaysia West succeeded, domain `icypebble-5f4a6cbb.malaysiawest.azurecontainerapps.io`. Deployment `prism-malaysia-release` succeeded; API and worker both Succeeded. Stateful resources remain in East Asia.
- Final image `serverless-20261117-region`, digest `sha256:fa24fa8ef49e83fa55dc9b4a9a2ac3155c1d9ff2ebda1277165bab883a34b08a`. Known Gemini FAILED_PRECONDITION/unsupported-location responses map to an allowlisted `PROVIDER_REGION_UNAVAILABLE` code; raw messages are not stored. RED/GREEN observed. Latest offline backend: 172 passed, 1 integration skipped; frontend 46 passed. Docker inspection confirmed `.env`, private parameters and browser artifacts absent.
- New API reports 81 outbound IPv4 addresses. Atlas cleanup targets only the 161 prior rules tagged `Prism Azure East Asia outbound`, preserving the PC rule. The CLI's `/32` deletion entry failed with 401 even after owner reauthentication; bare `ipAddress` deletion succeeded. Thus session expiry was not established as the cause of those 401s. The failed legacy cleanup made no changes and was stopped; replacement uses verified bare-IP API calls with fail-fast handling and paced concurrency. Cleanup/new IP acceptance still in progress.
- GitHub App webhook URL PATCH succeeded (200), pointing to the Malaysia hostname with SSL verification enabled; shared webhook secret preserved. Callback/setup remain owner UI actions; exact URLs were supplied. No model test has yet completed from Malaysia.


### Final live Malaysia AI acceptance - 17 November 2026

- Atlas: all 161 old East Asia rules removed using bare-IP deletion after one verified delete; paced batch removed the remaining 160 with zero failures. Fresh create/readback contains exactly **82 entries: 81 Malaysia outbound IPv4s plus the preserved PC entry**, no old deployment rules and no `0.0.0.0/0`. Initial `--file`/inherited-stdin CLI conflict was local-only; using an explicit closed stdin resolved it without duplicate requests.
- API startup logs confirmed MongoDB connected and `server_started`; replica Running/ready. Public `/api/health` returned 200 after flushing the PC DNS cache. Direct-IP TLS validation (`curl --resolve`, no insecure flag) independently returned 200 before DNS refresh.
- Isolated authorized test commit **`c9b0a2bf0b3cb50f43aedbbb4f27ce5f1710abd5`** pushed only a harmless Malaysia smoke-test comment to PR #4 branch `live_prismai_test`; unrelated workspace changes preserved. The GitHub webhook created a new durable job automatically. No manual diagnostic job start was used for this acceptance.
- **LIVE PASS:** saved report `webhook-939c4b3100a257d96ad94b384dedbb0620f31559af9499cb1d4ea9962cb0f2e5`, job completed, `aiStatus=completed`, provider Gemini, model `gemini-3.1-flash-lite`, **one attempt, model duration 4,752 ms**, usage **752 input / 587 output / 92 thinking / 1,431 total tokens**. All recorded GitHub/incremental/retrieval/memory/model stages completed.
- AI finding `Logic Inversion in Eligibility Check`, line 7, `source=ai`, cites `return !isDraft || !reviewsPaused;` and recommends `return !isDraft && !reviewsPaused;`. Saved walkthrough/impact cite real lines. Report also contains one separate rule-based test-gap finding; two total findings do not mean two AI findings. AI severity is advisory.
- This verifies a warm real signed GitHub event -> durable queue -> automatically started Malaysia worker -> real Gemini inference -> validated saved report. It does not prove cold webhook deadline reliability, broad model quality, revoked-access UI, email or hosted semantic Chroma. Historical cold-delivery failures and the measured 15-minute idle result were on the prior East Asia environment; the replacement retains min0/cooldown900 but has not repeated that timing measurement.
- New home: https://prism-demo-standard-web.icypebble-5f4a6cbb.malaysiawest.azurecontainerapps.io/ . Real Chromium confirms the landing page and Connect/Install controls without mocked API responses. Login callback generates the Malaysia `/api/github/callback` URL and successful login code redirects to root. Owner reported callback/setup update, then supplied GitHub validation-error screenshot; clean URL re-paste and successful Save remain unverified. Webhook URL was independently updated/verified via App API.
- Product source changes remain uncommitted. Only the two explicitly authorized isolated demo-branch test commits were pushed. No paid service/plan upgrade, always-on worker, dedicated compute, NAT, registry or log workspace added. Existing data/queue/identity resources retained. Exact monthly spend remains unmeasured.

### Source checkpoint - 17 November 2026

- Saved existing server, client and Azure deployment work in focused source commits before the next homepage redesign. No source push or new deployment is part of this checkpoint.
- Fresh offline verification: backend 172 passed, 1 optional integration skipped; frontend 46 passed; client production build and Bicep compilation passed. No live model requests were made for these checks.
- New logo assets, homepage design plan and unfinished homepage content tests remain isolated from this checkpoint. Local secrets and deployment parameter files remain excluded.
