# PRism AI — feature status and remaining owner actions

Status: **12 November 2026**. Implementation record: [chunk ledger](superpowers/plans/2026-10-31-pr-workflow-polish.md). Implemented means local code, not a claim of live deployment or measured review accuracy.

## Priority and completed slices

| Priority | Slice | Implemented | Verification boundary |
| --- | --- | --- | --- |
| P0 | Existing review workflow | Paginated GitHub patches, revision guards, unified diff, deterministic rules, Gemini structured findings, contextual walkthrough/impacts, saved history, actual progress | Existing workflow retained; live evaluation is separate from offline checks |
| P0 | E2 diagnostics | SDK input/output/thinking/total tokens (unknown = null), prompt/schema version, run ID, timing/failure metadata, report request details | Real usage saved in the live dev artifact; mocked checks and isolated Mongo read-back also exercised |
| P0 | GitHub App backend | State + PKCE login, opaque HttpOnly cookie, server-only user tokens, fresh installation/repository authorization, narrow installation tokens, installation-scoped reports/webhook IDs | Offline callback/replay/origin/access tests; real registration/installation not performed |
| P0 | Public access boundary | Production requires App credentials, HTTPS APP_ORIGIN and MongoDB; protected reads/writes; runtime storage gate; no-store API; CSRF origin checks | Single Node process; sessions restart on process restart; no enterprise tenancy claims |
| P0 | Usage control | Six review starts per user/installation per hour and thirty globally, plus existing two webhook jobs | In-memory limits reset at restart; public hosting/provider spending controls still need operator setup |
| P1 | E3 guidance | Opt-in REVIEW_GUIDANCE=lexical; ranked README/CONTRIBUTING sections, head revision, original coordinates, existing request/context budgets and sensitive-content filtering | Guidance can be omitted when the shared source budget is exhausted; not repository-wide semantic RAG |
| P1 | E3 retrieval experiment | Three original E1-linked relevance queries; lexical hit@1 and optional official-SDK embeddings/cosine comparison; version/hash/source references | Offline lexical artifact recorded; semantic path mocked only, no live embedding improvement claim |
| P1 | E4 feedback | Useful / Incorrect, optional reason, validated API, actor-derived annotation key, atomic Mongo update, saved UI states | Separate from generated evidence; not automatic training or a replacement for curated evaluation labels |
| P1 | E5 MCP | Official SDK, local stdio list_reports/read_report, bounded projections, malformed ID/scope rejection and credential-pattern filtering | Real SDK client/server protocol tested in memory; compatible desktop client setup remains manual; no public remote MCP endpoint |
| P0 | E6 delivery | Same-origin /api, Vite development proxy, configurable origin/CORS, Express static SPA deep links, offline CI workflow | CI configuration added; a GitHub-hosted CI run and public host are not inferred from local tests |
| Optional | GitHub feedback | Default-off advisory summary + access-controlled link, revision marker, bounded bot-comment lookup, safe failure status | Mocked posting/dedup test; requires explicit App PR-write permission and GITHUB_POST_REVIEW=true |
| P0 | E1 evaluation | Frozen 12 dev / 4 held-out review cases, Python scorer, opt-in collector, atomic artifacts, source hashes, quota-stop behavior | Human adjudication and a complete held-out quality baseline remain outstanding |

## Live evidence and actual blockers

### Completed demo upgrade — 12 November

- Public `/demo`: fixed owned fixture with recorded Gemini output; no database/auth/model request needed to view it. DEMO_ONLY=true explicitly closes private/generation/webhook/login routes.
- Retrieval: overlapping guidance chunks preserve coordinates; two of eight source requests reserved in guidance mode.
- Historical memory: maximum three useful labels, same PR/installation, different revision, current evidence mandatory. No training or cross-repository memory.
- Observability: real stage timings plus source/memory provenance; optional metadata-only Langfuse OTLP export with safe failure. Real ingestion remains unverified.
- Verification: 120 backend, 7 Python and 38 frontend checks passed, production build passed, actual HTTP health/sample/deep-link 200 and private GET/POST 503. Independent review found no important/critical defects. Browser visual/click QA remains manual.

No new application files or dependencies were needed. Deploy the captured demo first for minimal recruiter setup; account registration, hosting, credential rotation, live App onboarding and human evaluation remain owner actions. No public deployment is claimed.

Latest controlled generation: B01, configured gemini-3.6-flash, one attempt, HTTP 503 after 83,836 ms against a 120,000 ms deadline. No retry; previous successful public capture preserved. This failure does not establish that context size or model capability caused the provider error.

[Saved development run](beta/evaluation-live-dev.json): B01/B02/B03/B04/B06 completed with actual provider usage; B05 returned HTTP 503; B07/B08 returned HTTP 429. C01 is recorded interrupted with unknown request outcome following a Windows file-lock save failure; C02-C04 were not run. The collector now retries only transient filesystem renames and stops generation batches on 429. No generation retry loop was added.

This is **not** a full accuracy benchmark. Judgments remain empty, so precision/recall are intentionally unavailable. Do not put an accuracy percentage or response-time SLA in the CV/README. Held-out cases were not sent to Gemini.

[Retrieval artifact](beta/retrieval-offline.json) records a tiny synthetic lexical experiment with zero provider calls. Optional embeddings are implemented but not live-verified while quota is exhausted. This measures document relevance, not bug detection.

## Manual/account steps — next priority

1. **P0: rotate previously exposed credentials**, then register a GitHub App and configure the deployment secrets. No secret values belong in commits, screenshots or logs.
2. **P0: create free/student-eligible hosting and MongoDB**, configure HTTPS APP_ORIGIN, register callback/webhook URLs, and install the App on a test repository. See [setup](../README.md#github-app-setup-owner-actions).
3. **P0: live onboarding verification**: connect GitHub, select repositories, open/update a non-draft PR, confirm saved review, replay delivery, remove repository access and confirm the report is denied. Include a second account/repository for cross-access checks.
4. **P0: human evaluation**: adjudicate saved findings against frozen labels; later collect remaining dev/held-out cases within available quota. Never tune against held-out results.
5. **P1: optional PR summaries**: grant PR write only if desired, enable the flag, verify exactly one advisory summary per revision. It never approves/merges a PR.
6. **P1: desktop MCP setup and responsive browser QA**: configure a compatible local client and visually test desktop/mobile routes, login, feedback and diffs.
7. **Release decision: choose a project license**. No license was selected on the owner's behalf. Main is not merged without explicit approval.

## Operating boundaries

- This remains a single-user/portfolio-scale demo with simple installation access controls, not a scalable SaaS. One backend instance only; no durable queue or distributed sessions/quotas.
- Webhook acceptance is not model completion. A crash after 202 may require redelivery. A saved failed revision remains deduplicated; manual analysis can intentionally retry it.
- Production report storage fails closed; local mode can still fall back to memory. Do not expose local mode publicly.
- GitHub endpoint cap: 3,000 changed files; report snapshot limit: 4 MiB. AI context remains bounded to five reviewable files, 12k serialized diff characters and 8k snippet characters.
- MCP defaults to legacy/local reports; an explicit MCP_INSTALLATION_ID grants the trusted local database operator that scope. It is not browser authentication or a remote multi-user connector.
- Optional embeddings do not change production retrieval. No vector database, extra model provider, auto-merge, repository execution, email service or autonomous agent loop was added.
- Goal: zero recurring hosting cost where practical. Free/student offers have limits/expiry; no paid service or account purchase was made. Consumer subscriptions and API quotas are separate. Public deployment is still unverified.

## Work discipline

Implement one slice, run meaningful checks, commit to its feature branch, integrate on integration/v0-demo. Preserve user changes and main. Keep this status aligned with executed evidence; detailed commands and review fixes live in the chunk ledger.

## AI capability audit and priorities

Updated after the 12 November live verification. Framework names and implemented concepts are distinct; the rows below supersede earlier blocked/not-run notes where explicitly stated.

| Capability | Actual implementation / evidence | Decision for this demo |
| --- | --- | --- |
| Model calls and structured code review | Direct official Gemini SDK in `ai.service.js`; live smoke and B01 review succeeded, separate real PR generation returned 504 | Keep existing SDK; provider availability remains unresolved |
| Repository code/docs context | Revision-pinned source windows, selected imports, opt-in lexical README/CONTRIBUTING retrieval in existing services | Keep bounded retrieval; no whole-repository index claim |
| Serialization and tokens | Sanitized contents character/UTF-8 byte counts, validated JSON output, provider token metadata; raw prompts not stored | Implemented; byte counts exclude schema/system instructions |
| Tracing and latency | Local stage timings and metadata-only Langfuse OTLP exporter | Implemented; real Langfuse project ingestion still needs configured credentials/verification |
| Embeddings | Existing SDK/cosine experiment: two live batches succeeded; lexical and semantic both hit 3/3 owned relevance queries | Experimental only; no measured advantage on this tiny set |
| Chroma / persistent embedding store | Not implemented; no revision-scoped persistent vector index | Defer until repository-wide retrieval is a real requirement; would need a separate datastore/runtime |
| LangChain models/tools/retrievers | No LangChain dependency; direct SDK and small existing functions implement the current linear path | Defer adapter migration; it would duplicate working integration without solving 503/504 |
| LangGraph state/checkpoints/resume | No LangGraph; existing service sequences GitHub, retrieval, memory, model and save with explicit branches | Durable checkpoint/resume is missing; defer until interruptible multi-step work is required |
| Queue / pods | Two in-process webhook jobs; no durable queue, automatic retries, Kubernetes or pods | Restart recovery still requires redelivery; no scalable infrastructure needed for this demo |
| Previous versions / feedback memory | Scoped saved revisions and at most three useful prior labels, with current evidence validation | Implemented and offline tested; not model training or general chat memory |
| MCP protocol/server | Official SDK stdio server, scoped list/read reports; new demo-only read_demo_report verified through real child-process handshake/discovery/call | Compatible local stdio clients only; desktop setup, remote OAuth connector and public registry listing remain separate |

### Ordered next work

1. **P0 — stable live demonstration:** retain the verified recorded sample; observe model availability before promising live review reliability. Do not inflate timeout or add frameworks as a speculative fix. A separate model comparison is a possible next diagnostic, not an implemented fallback.
2. **P0 — owner acceptance:** hosting, GitHub App credentials/onboarding, desktop MCP setup and real Langfuse ingestion. Do not claim these passed from mocked tests.
3. **P1 — review usefulness:** human adjudication of frozen findings, then additional dev evaluation. Small relevance fixtures are not a bug-detection score.
4. **P2 — conditional architecture:** persistent semantic retrieval if broader code search is needed; checkpointed graph/queue if resumable work becomes necessary; LangChain only if it simplifies those integrations. These are deliberately unimplemented, not silently claimed complete.

### Current evidence

- Model discovery: configured model listed. Structured smoke: 16,113 ms, successful. Owned B01: 4,267 ms, completed with validated finding/walkthrough and token metadata.
- Real GitHub test PR HTTP flow: health 200, analysis 201, four GitHub requests, one model request, one saved file/patch, read-back 200 matching the diff. AI status unavailable with upstream HTTP504 after 119,392 ms; contents 966 characters/bytes. Storage for this check was isolated process memory, not a new MongoDB verification.
- Updated [live artifact](beta/evaluation-live-dev.json) preserves original evaluation plus demoCapture and retrievalCheck. No precision/recall claim without human labels.
- 122 backend, 38 frontend, 7 Python checks and production build passed. No new package or application file. Independent read-only review found no important/critical issue in diagnostics/MCP/capture changes.

Official references: [Gemini troubleshooting](https://ai.google.dev/gemini-api/docs/troubleshooting), [LangGraph stateful orchestration](https://docs.langchain.com/oss/javascript/langgraph/overview), [Chroma embedding storage/search](https://docs.trychroma.com/docs/overview/introduction), [MCP client/server architecture](https://modelcontextprotocol.io/docs/learn/architecture).

## Completion before Azure deployment — 13 November plan

**Budget:** target at or below INR200/month for the whole demo, not a spending allowance to consume. Student credit balance is not a monthly budget. No resources created by this plan; no hard monthly cap or zero bill guaranteed. Deployment follows local completion/verification.

**Inspected status:** GitHub App install/login/access checks and optional bot summary already exist in github.app.js. Verified webhooks reuse analysis.service.js; current jobs and OAuth/session/quota state live in process memory. MCP provides local stdio report tools, not a remote authenticated connector. `.github/workflows/checks.yml` already runs backend/frontend/evaluation checks and build; Docker, durable workers, email and CD are absent.

### Target flow

Connect/install GitHub App on selected repos → verified PR webhook → enqueue revision → acknowledge only after queue accepts → event-triggered worker → existing review service → save report → optional PR summary / opt-in report-ready email.

Worker and web API reuse one codebase/container image. Azure Container Apps Consumption plus an event-triggered Container Apps Job and Storage Queue are the proposed deployment components. Jobs start for work and stop; no always-running worker/VM. Use managed identity for queue access, not public worker invocation.

### Ordered implementation chunks

| Order | Work and existing files | Acceptance before commit |
| --- | --- | --- |
| 1 | Review reliability/context: inspect ai.service.js + ai.context.js failures; preserve bounded input/evidence validation; controlled model comparison if useful | Distinguish request/config/network/provider/validation failures; never label unavailable AI successful; no speculative timeout inflation |
| 2 | GitHub connection readiness: github.app.js; replace volatile OAuth/session state with scoped expiring MongoDB records, protect stored tokens; persistent usage limits | Callback survives API restart, replay rejected, logout/expiry/access removal enforced, no cross-user reads; real App registration/install remains owner verification |
| 3 | Durable jobs: extend webhook, analysis model/repository and service; add a small worker entry point only for the genuinely separate queue lifecycle | Queue failure never acknowledged as accepted; duplicate delivery atomically claimed; completed revision not regenerated; visibility/lease expiry handled; exhausted jobs visible |
| 4 | Email: dedicated small mail responsibility only if needed; call after report persistence; configurable Nodemailer SMTP transport, default-off, opt-in verified recipient | Plain report link/status, no raw private code; mail failure leaves report saved; delivery tracked separately; no duplicate send from event replay |
| 5 | Docker: multi-stage frontend build + existing Node server; worker command reuses image; `.dockerignore` excludes env/secrets/node_modules | Built container health, SPA/deep links, shutdown and worker command verified; no secret in image; image includes owned demo fixtures |
| 6 | CI/CD: extend existing checks workflow with container build; separate gated deployment workflow if needed; publish versioned image to GHCR, Azure OIDC authentication | Tests/build required first; least permissions, no long-lived cloud credential; deliberate deployment approval; no live model calls per push |
| 7 | Release acceptance, then Azure deployment | GitHub install/login → new PR → one job/review → accessible report → notification; replay/uninstall/restart/failure paths verified; browser QA and human usefulness checks recorded |

**Worker safety:** a queue can redeliver messages. Persist ownership/status and distinguish queue retries from AI generation retries. Crash after a provider request starts can leave an unknown outcome; mark for explicit recovery instead of promising exactly-once inference or automatically burning repeated calls. Retry email independently of AI review.

**Email proposal:** notify only an opted-in connected user at a verified address when their report is ready, with honest AI status. Recipient rules/provider credentials must be settled before implementation; never send to an arbitrary email from webhook/PR text. Nodemailer is a sending library, not a free delivery provider. Sender verification/domain or mailbox setup is an owner dependency; free quota does not remove that setup.

### Cost design

- Consumption/scale-to-zero web and event jobs, low parallelism and bounded execution. Persist sessions/job dedup/quotas in MongoDB so restarts do not bypass controls.
- At 100 reviews of 120 seconds with 1vCPU/0.5GiB each: about12000vCPU-seconds/6000GiB-seconds before startup, web traffic and retries. This is below the published monthly180000vCPU-second/360000GiB-second compute grants, assuming available allowances; not a total-bill guarantee. [Azure billing](https://learn.microsoft.com/azure/container-apps/billing).
- Prefer a public GHCR image to avoid introducing a fixed-price Azure registry. Keep logs bounded; check storage transactions, queue polling, image transfer and all ancillary services in the actual regional calculator before provisioning.
- Propose alerts at INR50/100/150/200 plus application-wide monthly review/email limits. Azure budget alerts notify; they do not themselves stop resources or enforce a hard INR200 ceiling. Retain student spending protection; do not upgrade/remove it as a workaround. [Budgets](https://learn.microsoft.com/en-us/azure/cost-management-billing/costs/tutorial-acm-create-budgets).
- Langfuse Cloud rather than self-hosting its stack; keep Gemini within configured API limits and avoid unbounded retries. No GPU, Kubernetes, always-on VM or Redis required for the agreed demo.

**Scope boundary:** finish this review/connect/jobs/notifications/container path before adding Chroma, LangGraph, new agents or a remote MCP service. Those remain conditional follow-ups. No account mutation, email send, dependency install or application change was made for this planning update.
