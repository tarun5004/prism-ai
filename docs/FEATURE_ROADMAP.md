# PRism AI — feature status and remaining owner actions

Status: **2 November 2026**. Implementation record: [chunk ledger](superpowers/plans/2026-10-31-pr-workflow-polish.md). Implemented means local code, not a claim of live deployment or measured review accuracy.

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
