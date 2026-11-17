# PRism AI

**A pull request changes code. PRism helps you inspect what that change could mean.**

Paste a GitHub PR URL—or receive a signed PR webhook—and get a saved review with the actual diff, a change walkthrough, potential impact and findings linked to code evidence.

Built as a small MERN + Gemini project. Feedback is advisory: PRism does not run your repository tests, approve a merge or guarantee that a PR is safe.

[Feature status & next steps](docs/FEATURE_ROADMAP.md) · [How features work](docs/FEATURE_CHEATSHEET.md) · [Evaluation notes](docs/beta/DEMO_AND_EVALUATION.md)

> **Delivery status — 13 November 2026:** the current V0 is on the local `integration/v0-demo` branch. Remote `main` does not contain this full V0; the integration branch is not published yet. Publishing it and reviewing its PR remain release steps. There is no verified public deployment URL.

## Take a 60-second tour

1. Open `/`: the introduction explains the workflow. **Try it for free** opens `/app`.
2. Paste a small accessible GitHub PR URL. Follow actual fetching, context, reviewing and saving stages; elapsed time is not a completion estimate.
3. Open the report: choose a changed file, inspect additions/deletions, then inspect the review or findings beside it.
4. Click an evidence reference to jump to its old/new diff line when that line is available.
5. Reopen the saved revision from `/analyses`.

**See a sample review** opens `/demo`: an owned synthetic code fixture paired with a recorded, validated Gemini response. It works without login, MongoDB or a new model request. The report is labelled captured and read-only.

A clean PR can have zero findings. A report can also have completed rule-based analysis while its AI review is unavailable. Those are different outcomes, and the UI keeps them separate.

### Interview demo update — 12 November 2026

For a public, read-only demonstration without GitHub registration or a database:

```powershell
npm run build
$env:NODE_ENV="production"
$env:DEMO_ONLY="true"
npm start --prefix server
```

Open `http://localhost:5000/demo`. This serves the owned B01 fixture and a captured Gemini response. No provider request is made when opening it. Demo-only mode disables private analysis/history access, generation, GitHub login/callback and webhooks; it skips MongoDB/App startup requirements. Clear `DEMO_ONLY` for the normal workflow. Hosting and a verified public URL remain owner actions.

The initial 12 November slices kept the direct Gemini SDK; the 14 November framework update below extends the same MongoDB review pipeline:

- **Retrieval:** opt-in `REVIEW_GUIDANCE=lexical` searches overlapping long Markdown sections with original coordinates; two of the existing eight source requests are reserved for guidance.
- **Historical memory:** at most three useful-labelled findings from another revision of the same PR and installation guide the review. Feedback reasons are excluded; findings still require current diff evidence.
- **Diagnostics:** report details expose actual GitHub/retrieval/memory/model timings, source coordinates and historical-memory provenance.
- **Optional Langfuse:** native OTLP HTTP/JSON exports operational metadata only, excluding code, prompts and feedback. A two-second deadline and safe failure preserve the review. Local timings work without an external account.

Optional server-only environment configuration:

```dotenv
LANGFUSE_ENABLED=true
LANGFUSE_PUBLIC_KEY=your-project-public-key
LANGFUSE_SECRET_KEY=your-project-secret-key
LANGFUSE_BASE_URL=https://cloud.langfuse.com
```

Use your project region's HTTPS origin. Langfuse still uses a small metadata-only exporter. LangChain providers, LangGraph checkpoints and optional Chroma retrieval are now implemented as described below.

Historical 12 November checks: **120 backend**, **7 Python evaluation**, **38 frontend** passed; production build passed. Actual production-mode HTTP checks returned 200 for health, the public sample and `/demo`, and 503 for private analysis GET/POST in demo-only mode. Independent review found no important/critical defects. Browser interaction, real Langfuse ingestion and hosted GitHub onboarding remain unverified. These results supersede the earlier dated verification below; they do not establish model accuracy.

One controlled live B01 request on 12 November used the configured `gemini-3.6-flash`: one attempt returned HTTP 503 after 83,836 ms, before its 120,000 ms deadline. No retry was made. The earlier successful captured sample remains available; live provider availability remains an external limitation.

## What actually happens

```text
PR URL ───────────────┐
                     ├─> GitHub metadata + paginated patches + revision check
Verified PR webhook ─┘          │
                                ├─> deterministic risk signals
                                └─> bounded code context → Gemini structured review
                                                               │
                                      validate files/lines/evidence
                                                               │
                                          save report → diff + review UI
```

- **GitHub supplies the facts:** files, statuses, patches, base/head SHAs and PR intent.
- **Rules flag simple signals:** broad impact, API-facing changes, sensitive changes and test gaps. A signal is not proof of a bug.
- **Gemini reasons over supplied context:** summary, walkthrough, potential impact and potential bugs/security/logic errors.
- **Application code checks the output:** malformed findings and invalid evidence references are rejected. Matching evidence does not itself prove that the model's reasoning is correct.
- **The database preserves the report:** MongoDB when connected; in-memory storage for local fallback. New manual runs get new report IDs.

## GitLab CI checks

[.gitlab-ci.yml](.gitlab-ci.yml) reuses the existing tests without application secrets or live model requests:

1. `javascript_tests`: install locked server dependencies, run backend/frontend Node tests, publish JUnit reports. Backend test-file concurrency is bounded at two to reduce startup contention on small runners.
2. `python_checks`: run the existing evaluation-scoring unit tests with Python 3.12.
3. `queue_integration`: use isolated MongoDB 8 and Azurite service containers to verify duplicate jobs, pause controls and process-restart recovery. `TEST_MONGODB_HOST` and `TEST_AZURE_STORAGE_CONNECTION_STRING` change only test endpoints; localhost remains the default. The Azurite key in YAML is a public emulator key, not an Azure credential.
4. `frontend_build`: runs only after all test jobs pass, installs locked client dependencies and builds the frontend.

Node JUnit reports appear in GitLab's pipeline test view. XML reports and `client/dist/` are downloadable job artifacts with a configured seven-day expiry; they are not permanent evidence. A failed test fails its job and blocks the build. Branch/MR rules avoid duplicate push pipelines when an MR pipeline already exists.

Keep GitHub as the primary repository. GitLab receives a separate copy when you push to its remote; this file does not automatically synchronize GitHub pushes or publish GitHub PR checks. No deployment, registry publication, paid API credentials or Azure resources are configured here. GitLab-hosted runner verification/quota can still prevent execution. Configuration validation and local checks do not prove a hosted pipeline passed.

Example after configuring a `gitlab` remote for the intended private project:

```powershell
git push gitlab HEAD
```

Open **Build → Pipelines** to inspect the resulting run. The existing GitHub Actions workflow is retained. [GitLab services](https://docs.gitlab.com/ci/services/) · [CI Lint](https://docs.gitlab.com/api/lint/).

## Run it locally

Use Node.js **22.12+** and npm. MongoDB is optional for exploration; use it for persistent history and restart-safe webhook deduplication.

From a checkout containing the current V0:

```powershell
npm run install:all
Copy-Item server/.env.example server/.env
```

Copy the example only on first setup; keep an existing `.env`. Configure the values below, then start both apps from the repository root:

```powershell
npm run dev
```

| Open | Purpose |
| --- | --- |
| `http://localhost:5173/` | Introduction and sample entry |
| `http://localhost:5173/app` | Submit a PR and watch progress |
| `http://localhost:5173/analyses` | Saved reports |
| `http://localhost:5000/api/health` | Backend health |

The frontend uses same-origin `/api`; Vite proxies it to port 5000 during development. Production Express serves the built frontend and API together, including SPA deep links. `VITE_API_BASE_URL` is an optional build-time override; same-origin deployment is recommended for the session-cookie flow.

### Environment: what you need and why

All credentials belong in **`server/.env`**, which is ignored by Git. Never put them in client code or commit screenshots containing them.

| Variable | Use |
| --- | --- |
| `PORT` | Backend port; default `5000` |
| `MONGODB_URI` | Persistent reports. Local development can fall back to memory; production and queued jobs require connected MongoDB |
| `GITHUB_TOKEN` | Server-side GitHub access; useful for rate limits and required for private repositories it is permitted to read |
| `GEMINI_API_KEY` | Enables Gemini review. Without it, rule-based analysis still works |
| `GEMINI_MODEL` | Model available to your key. The example config uses `gemini-3.6-flash`; availability and latency depend on the provider |
| `GEMINI_TIMEOUT_MS` | Review deadline; current default/example is `120000` ms. This is a limit, not a promised response time |
| `GITHUB_WEBHOOK_SECRET` | Shared secret for validating incoming webhook signatures |
| `GITHUB_WEBHOOK_REPOSITORY` | The single allowed `owner/repository` for the current webhook demo |

`GITHUB_TOKEN` can be added manually if absent from the example. `AI_API_URL` and `AI_API_KEY` are legacy example entries; the active review provider uses `GEMINI_*`, not those values.

## Automatic reviews: current webhook setup

Local mode supports the manually configured repository webhook below. GitHub App onboarding code is also implemented; registration, credentials and live installation verification are owner actions described later.

1. Configure the webhook secret and allowed repository in `server/.env`; restart the backend.
2. Provide a public HTTPS endpoint forwarding **only** `/api/webhooks/github` to the local API. For local testing this can be a path-restricted tunnel. Do not publish the whole backend: manual report/analysis routes currently lack authentication.
3. In the configured GitHub repository, open **Settings → Webhooks → Add webhook**. Set the payload URL to `https://YOUR-HOST/api/webhooks/github`, content type to `application/json`, and secret to the exact server value. Keep SSL verification on; subscribe only to **Pull requests**.
4. In **Recent Deliveries**, confirm the signed `ping`: `200` with `{"status":"ready"}`.
5. Open a non-draft PR, push a new commit, reopen it or mark it ready for review. Eligible actions are `opened`, `synchronize`, `reopened` and `ready_for_review`.
6. Expect `202` plus an `analysisId`, then check backend completion logs and refresh **Analyses**. The report appears after saving; `202` acknowledges receipt, not model success.
7. **Redeliver** the same PR revision. A completed stored report is reused; it must not trigger another model review. A new base/head revision has a different report ID.

Useful responses: `401` invalid signature; `403` repository not enabled; `413` body exceeds 1 MiB; `503` unconfigured or busy. Signed irrelevant events and draft/closed PRs are ignored. Optional App summaries are described below; merge events are ignored. Opt-in email delivery is described below.

Local inline mode allows two concurrent jobs in the API process; it is for development only. With `REVIEW_EXECUTION=queue`, the webhook saves a MongoDB job and waits for Azure Queue acceptance before returning 202. A separate worker atomically claims the revision, runs the existing review service and saves its outcome. Duplicate deliveries cannot claim the same job twice. Interrupted jobs become `unknown` after lease expiry: no blind model retry. Production rejects inline dispatch. See the local queue setup below.

[GitHub signature validation](https://docs.github.com/en/webhooks/using-webhooks/validating-webhook-deliveries) · [Webhook delivery practices](https://docs.github.com/en/webhooks/using-webhooks/best-practices-for-using-webhooks)

## Find the code without getting lost

| Start here | Responsibility |
| --- | --- |
| [App.jsx](client/src/app/App.jsx) | Browser routes, landing page, feature cards and sample entry |
| [DashboardPage.jsx](client/src/features/dashboard/DashboardPage.jsx) | Submission, progress, history, report and review views |
| [DiffViewer.jsx](client/src/features/dashboard/DiffViewer.jsx) | Unified diff parsing, old/new line numbers and evidence focus |
| [analysis.api.js](client/src/features/dashboard/analysis.api.js) | Client requests and incremental progress decoding |
| [analysis.controller.js](server/src/features/analysis/analysis.controller.js) | HTTP JSON/stream responses |
| [analysis.service.js](server/src/features/analysis/analysis.service.js) | Shared manual/webhook review workflow |
| [pullRequest.service.js](server/src/features/pullRequest/pullRequest.service.js) | GitHub retrieval and revision-pinned context enrichment |
| [ai.context.js](server/src/features/ai/ai.context.js) | Input limits, patch references and sensitive-content filtering |
| [ai.service.js](server/src/features/ai/ai.service.js) | LangChain Gemini structured output, prompt, validation and diagnostics |
| [analysis.repository.js](server/src/features/analysis/analysis.repository.js) / [model](server/src/features/analysis/analysis.model.js) | Report storage |
| [pullRequest.webhook.js](server/src/features/pullRequest/pullRequest.webhook.js) | Signature checks, event filtering and bounded dispatch |
| [github.repository.js](server/src/features/pullRequest/github.repository.js) | Encrypted expiring sessions and atomic usage counters |
| [analysis.jobs.js](server/src/features/analysis/analysis.jobs.js) / [review-worker.js](server/scripts/review-worker.js) | Queue dispatch and one-shot worker |
| [analysis.mail.js](server/src/features/analysis/analysis.mail.js) | Opt-in SMTP notification after persistence |

Stack: React 19, Vite, plain CSS, Express 5, MongoDB, LangChain Gemini/Mistral/xAI adapters, LangGraph checkpoints and optional Chroma semantic retrieval. Google's SDK supplies embeddings. Azure Storage Queue delivers durable jobs; the graph preserves workflow progress.

## API, briefly

| Method | Endpoint | Returns/does |
| --- | --- | --- |
| GET | `/api/health` | Backend health |
| GET | `/api/analyses` | Saved analyses; MongoDB query returns the latest 20 |
| GET | `/api/analyses/:analysisId` | One saved report or `404` |
| POST | `/api/analyses` | Analyze `{"pullRequestUrl":"https://github.com/owner/repo/pull/42"}` |
| POST | `/api/webhooks/github` | Verify and accept/ignore a signed GitHub event |
| PUT | `/api/analyses/:analysisId/findings/:findingIndex/feedback` | Save the current reviewer's useful/incorrect annotation |
| GET | `/api/github/session` | Safe connection status and App installation link |
| GET | `/api/github/login` / `/api/github/callback` | State/PKCE authorization flow |
| POST | `/api/github/logout` | End the current server session; requires matching Origin |
| PUT | `/api/github/notifications/email` | Authenticated opt-in/out with `{ "enabled": true }`; verified GitHub email only |
| GET | `/api/analyses/:analysisId/job` | Scoped queued/running/completed/failed/unknown status; no raw job payload |

Manual submission defaults to JSON. With `Accept: application/x-ndjson`, it streams progress frames and then one terminal result/error. The client does not automatically retry a generation request.

## Checks you can run

```powershell
# Backend offline suite: GitHub/Gemini calls are mocked in integration tests
npm test --prefix server

# E1 offline metric checks (Python standard library only)
python -B -m unittest discover -s server/test -p evaluation_test.py

# Frontend API, rendering and diff checks; uses existing Vite JSX transformation
cd client
node --test test/analysis.api.test.js test/diff-viewer.test.js
cd ..

# Frontend production build
npm run build
```

`npm run test:gemini --prefix server` is a separate **live provider smoke test**. It consumes a real API request; it is not part of the offline suite.

Recorded verification on **2 November 2026**: **112 backend checks**, **7 Python evaluation checks**, **36 frontend checks** and the frontend production build passed. Offline checks cover OAuth replay/origin checks, signed App JWTs, scoped history, feedback, MCP discovery/calls, token metadata and atomic artifacts. An isolated real MongoDB check preserved patches, feedback and token metadata; its temporary database was removed. Actual local HTTP health, report API and built SPA deep links passed. The saved live evaluation is partial and unadjudicated, not a measured quality score. Public GitHub App onboarding, hosted CI execution, desktop MCP configuration and browser interaction/visual QA remain unverified.

## Know the limits before reading the results

- GitHub retrieval handles pagination up to its 3,000-file endpoint cap and rejects report snapshots over 4 MiB. Missing/binary patches are reported rather than invented.
- AI input is intentionally bounded: up to five reviewable files, a 12,000-character serialized diff-file budget and an 8,000-character context-snippet budget. JS/TS enrichment follows selected direct relative imports; it is not repository-wide semantic search.
- Recognizable secrets/sensitive paths are filtered from model input, but this is heuristic filtering, not a complete data-loss-prevention guarantee. Saved diffs may contain sensitive repository content; protect database access.
- Invalid references are rejected, but valid references can still support incorrect reasoning. No measured model accuracy is published yet.
- GitHub App authentication, installation/repository-scoped reports, feedback and local read-only MCP are implemented. Their offline checks do not prove live App onboarding or a public deployment. Optional GitHub summaries are disabled by default and require additional permission.
- Hosting, database and AI-provider usage can have costs. Public source availability does not make unlimited hosted inference free. Project licensing is still a release decision; bundled font licenses apply to their assets.

## What comes next

**AI Evaluation V1:** 16 frozen synthetic code cases, an offline Python scorer and an opt-in Node collector. A partial [live development artifact](docs/beta/evaluation-live-dev.json) preserves five completed cases, one 503, two 429s and an interrupted case with unknown request outcome. Remaining cases are not run. Precision/recall still require human judgments. No full quality score is claimed; held-out cases remain untouched.

The recruiter-facing code path is **Install on GitHub → select repositories → Connect GitHub → automatic PR review**. It uses state/PKCE, HttpOnly sessions, server-only tokens and fresh repository access verification. Register and live-test the App before claiming onboarding works publicly. MCP is an additional local AI-client interface, not a replacement for webhook events.

Deployment target: at or below INR200/month for the whole recruiter demo, using available free/student allowances; this is a target, not a guaranteed bill cap. No paid host or public deployment was created by this evaluation slice. Provider API quota/billing is separate from consumer subscriptions.

Track acceptance criteria and completed work in [FEATURE_ROADMAP.md](docs/FEATURE_ROADMAP.md). The roadmap is the single feature backlog; the historical ledger records past decisions and checks.

## GitHub App setup (owner actions)

Code is implemented; no real GitHub App was registered or installed by this development run.

1. Register an App in GitHub developer settings. Use **Contents: read**, **Pull requests: read**, metadata read and the **Pull request** event. Optional emails also require the account permission **Email addresses: read**. For optional summary comments only, choose Pull requests: write.
2. Set the authorization callback and post-install setup URL to `https://YOUR-HOST/api/github/callback` and `https://YOUR-HOST/` respectively. Set the webhook URL to `https://YOUR-HOST/api/webhooks/github`, enable SSL verification and use a new shared secret. Enable user authorization during installation if offered.
3. Create the client secret and App private key. Add these server-only values to the host's protected environment; never paste a real key into documentation:

```dotenv
NODE_ENV=production
APP_ORIGIN=https://YOUR-HOST
MONGODB_URI=YOUR_PRIVATE_CONNECTION_STRING
SESSION_ENCRYPTION_KEY=YOUR_BASE64_32_BYTE_KEY
REVIEW_MONTHLY_LIMIT=100
REVIEW_EXECUTION=queue
AZURE_REVIEW_QUEUE_URL=https://YOUR_ACCOUNT.queue.core.windows.net/prism-reviews
GITHUB_APP_ID=YOUR_APP_ID
GITHUB_APP_SLUG=YOUR_APP_SLUG
GITHUB_APP_CLIENT_ID=YOUR_CLIENT_ID
GITHUB_APP_CLIENT_SECRET=YOUR_CLIENT_SECRET
GITHUB_APP_PRIVATE_KEY="YOUR_PEM_WITH_ESCAPED_NEWLINES"
GITHUB_WEBHOOK_SECRET=YOUR_NEW_RANDOM_SECRET
GEMINI_API_KEY=YOUR_GEMINI_KEY
GEMINI_MODEL=YOUR_AVAILABLE_MODEL
GITHUB_POST_REVIEW=false
REVIEW_GUIDANCE=off
```

Use the PEM text with literal `\n` escapes where the deployment environment cannot hold multiline secrets. `APP_ORIGIN` is one HTTPS origin without a trailing slash or path. App mode uses installation credentials for events and the authenticated user's scoped token for manual requests; it does not fall back to the owner's global token. `GITHUB_WEBHOOK_REPOSITORY` is only required for legacy local webhook mode.

4. Build using `npm ci --prefix server`, `npm ci --prefix client`, then `npm run build --prefix client`. Start with `npm start --prefix server` from the repository root. Run the web API plus a queue-triggered worker using the same image; use the setup below. Production refuses memory-only storage and missing App configuration.
5. Open the site, install on selected repositories, then connect GitHub. Open/update a non-draft PR and check the saved report. Remove repository access and confirm it cannot be reopened. Repeat with another account. These are required live checks, not inferred from mocked tests.

Sessions, consumed OAuth state and review counters now persist in MongoDB. Tokens are encrypted with AES-256-GCM; keep the same private `SESSION_ENCRYPTION_KEY` across API/worker restarts. Authorization rechecks GitHub before report reads and feedback writes. Allowances are six starts per actor/installation per hour, thirty globally per hour and `REVIEW_MONTHLY_LIMIT` globally per UTC month (default 100). These count review starts, not provider tokens or money, and do not guarantee a billing cap.

`GITHUB_POST_REVIEW=true` enables one advisory bot summary/link per installation/repository/base/head revision. It scans at most 300 existing comments, posts after saving, never approves or merges, and records failed delivery without erasing the report. Grant PR write only when enabling it. A real summary and sequential duplicate prevention were verified on the owned PR on 16 November; the new features below have separate acceptance boundaries.

### Core PR review controls — 17 November

The same pipeline now supports incremental reviews, repository settings, inline findings, PR commands and advisory commit status. This is a bounded implementation inspired by [CodeRabbit's review lifecycle](https://docs.coderabbit.ai/guides/code-review-overview), [commands](https://docs.coderabbit.ai/reference/review-commands) and [configuration](https://docs.coderabbit.ai/reference/configuration), not full commercial parity or its private implementation.

**Owner setup:** add desired switches to the existing ignored `server/.env`; do not replace your credentials. All new switches default off.

```dotenv
REVIEW_REPOSITORY_CONFIG=true
GITHUB_REVIEW_COMMANDS=true
GITHUB_POST_INLINE=true
GITHUB_POST_STATUS=false
```

1. GitHub App **Permissions & events**: Contents read, Pull requests read/write. Subscribe to **Pull request** and **Issue comment** events. Commands use PR conversation comments, not inline review threads. Save and approve installation permission changes if requested.
2. Optional status: grant **Commit statuses read/write**, then set `GITHUB_POST_STATUS=true`. This uses commit statuses, not the Checks API. Do not use this advisory context as a required merge gate.
3. Restart backend and worker. On a non-draft PR in an installed repository, post `@prism-ai help`, then `@prism-ai review`. Only fresh write/maintain/admin permission is accepted; read-only users and bots cannot trigger commands.

| Command (prefix `@prism-ai`) | Behavior |
| --- | --- |
| `review` | Incremental from a compatible successful baseline, otherwise full diff |
| `full review` | Complete current PR diff |
| `pause` | Stop future automatic work for this installation/repo/PR |
| `resume` | Enable future automatic events; does not immediately run a review |
| `summary` | Link latest saved report; it may describe an older revision |
| `help` | List commands |

Explicit reviews bypass pause once and consume normal review allowances. Same comment ID means same job across redelivery/pushes; post a new command for a deliberate fresh run. Edited comments are ignored. Pause persists without expiry in MongoDB; no-database development fallback is volatile. Already-running inference is not cancelled; queued jobs recheck pause before starting.

**Incremental scope:** `synchronize` events compare the last successfully AI-reviewed head against current head only for the same installation/PR/base and a proven ancestor. Force-push, changed base, partial/failed baseline, unavailable history or comparison at the 300-file boundary falls back to full review. The actual patch and `diffBaseSha` are saved and shown; unchanged earlier code is not reviewed again. Manual UI reviews stay full.

**Repository settings:** optional `.prism.json` is read at the PR **base SHA**, so a contributor cannot change their own effective settings. Missing config uses defaults; malformed/unavailable configured policy fails closed. Paths are literal files or directory prefixes ending in `/`, without glob syntax.

```json
{
  "autoReview": true,
  "ignorePaths": ["vendor/", "generated/", "package-lock.json"],
  "pathInstructions": [
    { "path": "server/src/", "instructions": "Check resource ownership before modifying a user's records." }
  ]
}
```

Limits: 8 KiB config, 20 ignored paths, 10 guidelines of 500 characters. Guidelines cannot override security/evidence rules, authorize tool execution or prove defects. Exclusions remain visible. `autoReview:false` suppresses automatic reviews; deliberate authorized review still works.

**GitHub delivery:** optional inline feedback posts at most five unique validated AI findings in a `COMMENT` review, pinned to the reviewed head. Stale/closed PRs are skipped. Incremental findings must also map onto the current full PR diff; unmappable ones remain in the web report. No approvals, requested changes, auto-fixes or merges. Rules are not posted as confirmed AI bugs. Optional `prism-ai/review` status is green only for completed AI, never partial/unavailable AI, and explicitly means advisory completion. Missing write permissions/network failures preserve reports; core read tokens do not request optional status permissions. Sequential/in-process duplicate checks are not an exactly-once guarantee after ambiguous network/process crashes.

Verification: mocked GitHub/model contracts and real local Mongo/Azurite restart/queue checks are recorded in [the feature ledger](docs/FEATURE_ROADMAP.md). New command/inline/status delivery still needs live acceptance after the App setup above. No new hosted CI run, deployment, paid model request or live GitHub comment/status was made for this slice.

No host account, paid service, license or deployment URL was created. Free/student hosting eligibility and sleep limits need checking; sleeping instances can miss GitHub's webhook response deadline. No always-on/free-unlimited claim is made.

## Feedback, diagnostics and retrieval experiments

Each finding has **Useful / Incorrect** and an optional reason. The backend derives the reviewer identity from the session; annotations are separate from the original AI finding and survive reopening. Local mode uses a local reviewer identity. Feedback is not automatically used for model training.

Request details show provider-reported tokens, prompt/schema version and run ID. Missing usage stays **unknown**, including most failed requests. No raw prompts, tokens or SDK error messages are logged. SDK counts are not currency estimates.

Set `REVIEW_GUIDANCE=lexical` to try ranked README/CONTRIBUTING context at the PR head revision. It shares existing budgets and may be omitted when source/import reads consume them. Source paths, ranges and revisions remain in coverage. This is lexical retrieval, not a repository-wide embedding index.

```powershell
# Offline relevance experiment; no model/GitHub request. Use a NEW output path.
node server/scripts/evaluate-ai.js --retrieval-experiment --out retrieval-run.json

# Explicit optional embedding comparison: at most two SDK embedding batches, no retries.
node server/scripts/evaluate-ai.js --retrieval-experiment --semantic --out semantic-run.json
```

Semantic mode uses `GEMINI_EMBEDDING_MODEL` or `gemini-embedding-001`, query/document task types and cosine ranking. It remains an experiment; it does not change the production retrieval default. The [offline artifact](docs/beta/retrieval-offline.json) uses three tiny owned fixtures. Real embedding calls were not made after review requests reached HTTP 429. Relevance hit@1 is separate from AI finding precision/recall.

## Local read-only MCP

Use a trusted local MCP client that can spawn a stdio server. MongoDB must contain saved reports; an independent process cannot read another process's temporary memory store.

```json
{
  "mcpServers": {
    "prism-ai": {
      "command": "node",
      "args": ["/ABSOLUTE/PATH/TO/prism-ai/server/scripts/mcp.js"]
    }
  }
}
```

The script reads `server/.env` itself. Tools: `list_reports` (up to 20) and `read_report` (up to 10 findings, bounded text, no raw patches). Results label repository/model content as untrusted. Recognizable secret patterns are filtered, not a complete DLP guarantee.

For a database-free interview demo, add `"env": { "DEMO_ONLY": "true" }` beside `command` and `args` in the client configuration above. This advertises only `read_demo_report`, returning the owned captured fixture with its actual AI review. Private database tools are absent. This path was verified using a real SDK stdio child process, handshake, tool discovery and invocation. A compatible MCP host must support local stdio; this is not a remote connector for every AI app. A public registry listing has not been published.

By default the connector reads legacy/local reports only. A trusted database operator can explicitly set `MCP_INSTALLATION_ID` for one installation. This local operator scope is not a public authentication mechanism: do not expose this process as an unauthenticated network service. The connector never generates reviews, writes GitHub comments or replaces webhook events. SDK client/server discovery and tool calls were exercised offline; configuring a desktop client remains manual.

## Latest API verification — 12 November continuation

Configured `gemini-3.6-flash` appeared in live model discovery. A tiny structured request succeeded in 16,113 ms. The actual owned B01 code review succeeded in 4,267 ms with one valid finding, a grounded walkthrough and provider-reported 466 input / 558 output / 1,024 total tokens. The public sample now uses this capture; the original partial evaluation is preserved separately in the same artifact.

A real HTTP POST for the repository's test PR #1 then retrieved GitHub metadata/patches (four GitHub requests), invoked Gemini exactly once and saved/read the report successfully in an isolated in-memory process. That generation returned upstream HTTP 504 after 119,392 ms against a 120-second deadline. Its sanitized contents were only 966 characters/bytes. This demonstrates that requests reach the provider and that the failure is not explained by a large input in this case; it does not identify the provider's internal cause. Live availability is intermittent, not fixed by the successful fixture. No automatic retry or provider fallback was added.

Request details now show exact serialized contents characters and UTF-8 bytes, excluding system instructions/schema. Counts are not token estimates, and raw serialized prompts are not persisted. The optional live embedding comparison completed two bounded calls: lexical and semantic retrieval both selected the labelled relevant document on all three tiny queries. This is not review accuracy, a persistent vector index or evidence that embeddings improve the production path.

Fresh checks: **122 backend**, **38 frontend**, **7 Python** checks and production build passed. Public demo API/SPA/health returned 200; demo-only private history returned 503. Existing environment changes were preserved, no new dependencies/application files were added. See the [feature comparison and priorities](docs/FEATURE_ROADMAP.md#comparison-new-request-versus-existing-features) before choosing another framework.


## Release setup — 13 November

Completed locally: persistent encrypted sessions/quotas, durable webhook jobs, opt-in email backend/UI, Docker web/worker image and gated Azure CD configuration. **130 backend, 40 frontend and 7 Python tests passed.** Real isolated MongoDB, local Azurite duplicate delivery and the container worker were exercised. The production dependency audit reports zero runtime vulnerabilities; two moderate development-only nodemon/minimatch findings remain.

One controlled B01 model call returned upstream **503 after 32,565 ms**, one attempt, no retry. The successful captured demo remains available. This run does not establish live provider reliability, hosted onboarding, SMTP delivery, browser QA or Azure deployment.

### 1. Persistent local authentication

Keep your existing ignored `server/.env`; add the new settings there. Do not overwrite it with the example. Generate a private encryption key locally:

```powershell
node -e "process.stdout.write(require('node:crypto').randomBytes(32).toString('base64'))"
```

Copy the output into `SESSION_ENCRYPTION_KEY`. Never share it. MongoDB must be connected for persistent auth and queued reviews; production fails closed if storage is unavailable. Changing the key invalidates existing encrypted records. Install current dependencies with `npm ci --prefix server` and `npm ci --prefix client`.

### 2. Run the queue locally before Azure

These commands use a local storage emulator, not your Azure subscription. Docker Desktop must be running. In a separate terminal:

```powershell
docker run --rm --name prism-azurite -p 127.0.0.1:10001:10001 mcr.microsoft.com/azure-storage/azurite azurite-queue --queueHost 0.0.0.0 --skipApiVersionCheck
```

Add to `server/.env`:

```dotenv
REVIEW_EXECUTION=queue
AZURE_STORAGE_CONNECTION_STRING=UseDevelopmentStorage=true
AZURE_REVIEW_QUEUE_NAME=prism-reviews
REVIEW_MONTHLY_LIMIT=100
```

Create the emulator queue once from `server/`:

```powershell
cd server
node --input-type=module -e "import {QueueClient} from '@azure/storage-queue'; await new QueueClient('UseDevelopmentStorage=true','prism-reviews').createIfNotExists();"
cd ..
```

Start the app with `npm run dev`, then open/update a test PR through the configured webhook. Expect 202 only after enqueue succeeds. From another terminal run:

```powershell
npm run worker --prefix server
```

The worker handles **one message and exits**; run it again for another message. Azure's event job trigger will start worker executions automatically once configured. The queue and MongoDB survive API restarts; the emulator above is temporary and discards its queue on container removal.

`GET /api/analyses/<analysisId>/job` returns the authorized job status. `completed` means the pipeline saved a report; inspect its separate AI status. `failed`/`unknown` require investigation or an intentional new manual analysis. A crash may have already consumed a model request, so replay never blindly regenerates. An `unknown` outcome is detected when an expired running message is revisited. No general checkpoint/resume engine is claimed.

For the earlier local inline demo, leave `REVIEW_EXECUTION` unset. Production requires the queue path. The queue must exist before use; missing/unreachable storage returns a safe error rather than false acceptance.

### 3. Optional review-ready email

Nodemailer sends via your SMTP provider; it does not provide a mailbox or free delivery plan. Configure a verified sender and provider credentials privately:

```dotenv
EMAIL_ENABLED=true
EMAIL_FROM=verified-sender@example.com
SMTP_HOST=your-smtp-host
SMTP_PORT=587
SMTP_USER=your-smtp-user
SMTP_PASS=your-smtp-password
```

For a personal Gmail demo, Nodemailer is already installed; no extra npm command is needed:

1. Enable Google Account **2-Step Verification**.
2. Open [App passwords](https://myaccount.google.com/apppasswords), create one named `PRism AI`, and keep it private. This option may be unavailable for some managed/Advanced Protection accounts; see [Google guidance](https://support.google.com/mail/answer/185833?hl=en).
3. In existing `server/.env`, use `SMTP_HOST=smtp.gmail.com`, `SMTP_PORT=587`, your Gmail address for both `SMTP_USER` and `EMAIL_FROM`, and the generated App Password for `SMTP_PASS`. Set `EMAIL_ENABLED=true`; use the App Password rather than your normal Google password. See [Nodemailer's Gmail guide](https://nodemailer.com/guides/using-gmail).
4. Restart the backend with the new environment. A running Docker container keeps its original environment and must be recreated to pick up changed settings.
5. Complete GitHub App login, grant email read access, and enable **Review-ready emails**. SMTP setup alone does not create an authenticated/opted-in recipient. These App credentials are currently a separate owner setup task.

Nodemailer formats/sends messages; Gmail is the actual SMTP service. Current verification used JSON transport without sending external mail. Real SMTP authentication/inbox delivery remains pending until credentials and consent are configured.

Use port 587 with STARTTLS or 465 with TLS. Reconnect GitHub after granting **Email addresses: read**, then explicitly enable the email checkbox. Default is off. The server ignores request-supplied recipient addresses, checks current repository access and obtains the verified address from GitHub immediately before sending.

The message contains status and an access-controlled report link, not private code. Manual reviews notify their connected requester; webhook reviews notify the PR author only if that author has connected and opted in. Authorization ends with the session or logout; reconnect to renew it. No background OAuth refresh was added. Mail failure never erases a saved report. Duplicate claims are blocked; uncertain SMTP/crash outcomes are not automatically resent. Real delivery still needs your test.

### 4. Docker: one image, two commands

```powershell
docker build -t prism-ai:local .
docker run --rm -p 5000:5000 -e DEMO_ONLY=true prism-ai:local
```

Open `http://localhost:5000/demo`. This read-only container needs no MongoDB or provider key. For the full workflow pass a private env file and correct public `APP_ORIGIN`. API command is the image default; worker command is `node server/scripts/review-worker.js` using the same image.

Inside Docker, `localhost` means the container. For host MongoDB use `host.docker.internal`; for host Azurite use a full connection string with its explicit `QueueEndpoint` and emulator credentials. The `UseDevelopmentStorage=true` shortcut points at container loopback. Keep connection strings in the private env file. The multi-stage image runs as non-root and excludes `.env`, source control and dependency caches.

### 5. Azure and CI/CD: owner setup after local acceptance

#### Low-traffic serverless configuration — 17 November

The deployment template is [infra/main.bicep](infra/main.bicep). It provisions a standard Container Apps environment with only the Consumption workload profile, one HTTP app, a Storage Queue, separate API/worker managed identities with queue-scoped roles, and an event-driven one-shot job. **Manually deployed to Azure for Students in East Asia on 17 November.** The environment mode is explicitly `WorkloadProfiles`: Express does not support this worker Job. No account billing/CI verification was bypassed.

Deployment: [PRism workspace](https://prism-demo-standard-web.icypebble-5f4a6cbb.malaysiawest.azurecontainerapps.io/app). Live health/frontend/session checks returned HTTP 200; unauthenticated reports returned 401. Azure-to-Atlas ping and an unmodified empty-queue worker passed after adding the environment's current outbound IPs to Atlas. This does not prove a real PR/model review or reliable cold delivery. [Current evidence and remaining owner setup](docs/FEATURE_ROADMAP.md#azure-deployment-execution--17-november).

**Known live limitation:** real GitHub `ping` delivery passed when warm (200 in 0.55 seconds), but two cold attempts exceeded GitHub's 10-second deadline. Automatic scale-to-zero was observed; reliable cold webhook ingestion is **not** established. Open the workspace before a controlled PR demo and inspect/redeliver failed events. Unattended cold ingestion needs a fast durable ingress; no always-on workaround was introduced. See the evidence ledger for failed attempts, the tested startup improvement and the final deployment settings.

- HTTP app: **0.5 CPU / 1 GiB**, `minReplicas=0`, `maxReplicas=1`, `cooldownPeriod=900` (15-minute idle target, not an exact shutdown timer). Platform startup/readiness/liveness probes use `/api/health`; they do not call AI. Inference SDKs load at model invocation, not queued API startup. This first release serves the built React frontend and API from the same Docker image/origin; opening the site can wake the app. It does not create a separate static-hosting service.
- Worker: same image, command `node server/scripts/review-worker.js`, event-triggered with `minExecutions=0`, one message per process, 600-second timeout, no platform replica retry, 30-second scaler polling. `maxExecutions=1` limits starts per polling interval, **not global concurrent workers**. Mongo claims prevent duplicate inference for one revision, not concurrent inference for different PRs.
- Manual reviews in `REVIEW_EXECUTION=queue` mode now return **202 only after the Mongo job is saved and Queue accepts its ID**. A metadata-only GitHub request pins the revision first. The user token is not stored in the job. The worker obtains a fresh installation token; manual/webhook submissions share the installation/repository/base/head identity. A pre-model skipped job can be explicitly submitted manually again; completed/failed/unknown outcomes are not blindly reset.
- The UI navigates to the accepted report URL and polls every 5 seconds, at most 120 job reads. Closing the page stops polling, not accepted work. Reopening the URL reads the report or resumes status polling without another POST. Failed/interrupted/skipped jobs stay visible; retries do not silently start another model request.
- Inference quota is consumed in the worker after claiming, not again when the API enqueues. The template sets the existing shared monthly allowance to 20. This bounds accepted review executions; it is not an Azure billing cap or a guarantee of 20 successful AI responses.
- The baseline template passes an AI key only to the worker. SMTP, GitHub publishing flags and hosted Chroma are not enabled by this template. Existing capabilities remain in code; persistent hosted Chroma is a separate cost/auth/storage decision and must not use the worker's temporary filesystem. No paid registry, log workspace, NAT gateway, dedicated profile or Kubernetes cluster is provisioned. Log routing is omitted, so retained application logs are unavailable; report diagnostics remain in MongoDB. The live ARM API rejected the literal destination `'none'` even though the CLI accepts that option. Enable retained logging deliberately if needed.

For repeat manual deployments:

1. Build/test the Docker image locally, publish an immutable image to your chosen registry, and confirm Azure can pull it. Hosted CI is not needed for a manual release; local tests are not evidence that hosted CI passed.
2. Install Azure CLI/Bicep, authenticate locally with `az login`, select the intended student subscription, and check Container Apps Consumption/event-job quota and availability in the target region. Check remaining credit and costs for storage, logs, networking and external services. Free grants do not guarantee the complete application costs zero.
3. Prepare an **untracked** `infra/demo.parameters.local.json` ARM parameter file. Non-secret parameters: `name`, `location`, optional `statefulLocation`/`environmentName` for a compute-region migration, `image`, `githubAppId`, `githubClientId`, `githubAppSlug`, `aiProvider` (`gemini`, `groq`, `mistral`, `xai`) and `aiModel`, plus optional `aiMaxRetries` (0 or 1; default 1). The secure `credentials` object requires `mongoUri`, `sessionEncryptionKey` (32-byte base64), `githubPrivateKey` (PEM with real newlines), `githubClientSecret`, `webhookSecret` and `aiApiKey`. Preserve the existing session encryption key when reusing a database. Prefer Key Vault parameter references for shared automation. Never paste credentials into chat, command arguments or committed files.
4. Review a deployment what-if before provisioning. The current manual release passed what-if and deployment using the compiled template and private parameters. Adapt these commands for a future release:

   ```powershell
   az bicep build --file infra/main.bicep --outfile "$env:TEMP/prism-arm.json"
   az group create --name prism-demo --location <verified-region>
   az deployment group what-if --resource-group prism-demo --template-file infra/main.bicep --parameters '@infra/demo.parameters.local.json'
   # Run create only after reviewing resources, subscription and cost.
   az deployment group create --resource-group prism-demo --template-file infra/main.bicep --parameters '@infra/demo.parameters.local.json'
   ```

5. Use the deployment's `appOrigin` output for GitHub callback (`/api/github/callback`) and webhook (`/api/webhooks/github`) URLs. Configure MongoDB network access for the app environment's actual outbound connectivity without adding an unplanned paid networking service. Allow Azure RBAC propagation before testing queue access.
6. Verify one real accepted review, duplicate delivery, saved report after restart, worker exit, idle scale-down to zero and wake-up on the next request. Check actual Azure consumption after testing. GitHub expects a response within 10 seconds and does not automatically redeliver failed webhooks: cold-start delivery is a release acceptance gate, not an assumed success. If it fails, evaluate a small durable ingress separately.

Official references: [scaling](https://learn.microsoft.com/en-us/azure/container-apps/scale-app), [event-driven jobs](https://learn.microsoft.com/en-us/azure/container-apps/tutorial-event-driven-jobs), [billing](https://learn.microsoft.com/en-us/azure/container-apps/billing), [GitHub delivery failures](https://docs.github.com/en/webhooks/using-webhooks/handling-failed-webhook-deliveries). Startup and cooldown can consume compute; only zero replicas means no container resource consumption. Storage, external database/vector services and model usage have separate costs.

The manual release uses a public GHCR image pinned by digest, Container Apps Consumption web service with minimum replicas zero, Storage Queue, and an event-triggered Container Apps Job running the worker. Reports/auth/jobs persist in MongoDB Atlas; the access list preserves the PC entry and includes the 81 Malaysia Azure outbound IPs reported at deployment (82 entries including the preserved PC rule), without `0.0.0.0/0`. These addresses can change and need refresh; no fixed-egress NAT was added. The same encryption key and necessary server secrets are supplied to both commands. Deployed queue access uses managed identity and `AZURE_REVIEW_QUEUE_URL`, with separate sending, processing and scaler-read permissions.

The worker limits starts to one per polling interval, with no platform execution retries and a 600-second execution timeout shorter than the 900-second visibility/ownership lease. This is not a global concurrency cap. Account for worst-case GitHub/context/model work when choosing that timeout. Queue scaling is explicitly configured; the one-shot script does not schedule itself. No always-on VM, Redis or paid registry was added. Budget alerts are a separate owner configuration and do not stop spending. Student spending limit remains On, but it does not guarantee INR200/month.

The existing [workflow](.github/workflows/checks.yml) runs tests, builds the image and checks its public sample. Only a manual run with `deploy=true` on `integration/v0-demo` publishes a SHA-tagged GHCR image and reaches the protected `production` environment. Configure required reviewers for that environment and Azure OIDC federation for this repository/environment. Set these repository/environment variables:

- `AZURE_CLIENT_ID`, `AZURE_TENANT_ID`, `AZURE_SUBSCRIPTION_ID`
- `AZURE_RESOURCE_GROUP`, `AZURE_APP_NAME`, `AZURE_WORKER_JOB_NAME`

The manual release provisioned the web app, queue, identity/scaler and worker job; CD only updates existing images. GHCR is public for anonymous Azure pulls. Grant any future CI deployment identity access only to the intended resources. Hosted Actions/OIDC remain untested; manual Azure deployment evidence is separate from hosted CI. Both image updates are sequential, not an atomic release, so inspect both resources after deploying.

**Live acceptance:** a real signed PR #4 event enqueued work, automatically started the Malaysia worker, completed Gemini inference, caught the intended boolean bug and saved its validated report. **Remaining manual acceptance:** finish GitHub callback/setup form validation and connect the deployed app → open the saved AI report → replay and confirm no second review → remove repository access and confirm denial. SMTP is disabled in this deployment; enable and test it separately if needed. A second account, browser layouts, real signed delivery and model quality remain distinct acceptance checks.


### Next agreed AI learning features — 14 November

LangChain Gemini/Mistral/xAI adapters, Chroma semantic RAG and Mongo-backed LangGraph checkpoints are implemented. Mistral/Grok live acceptance remains limited by quota/missing credentials. Extend the existing context, feedback memory, validators, report and tracing; do not create a parallel review system. See the [comparison and single backlog](docs/FEATURE_ROADMAP.md#comparison-new-request-versus-existing-features). Earlier dated direct-SDK/no-vector notes are historical; use the latest setup below.


### LangChain Gemini chunk — 14 November

Review and connectivity now call LangChain `ChatGoogle` from the recommended `@langchain/google` integration. It uses native JSON schema; the same application validators still reject unsupported code evidence. No new application files or API-key settings. Retries remain off and deadlines/bounded output remain enforced. Original provider token counts are preserved; ambient LangSmith prompt tracing is disabled, while optional metadata-only Langfuse export continues. Keep `LANGCHAIN_VERBOSE` unset/false: private calls fail closed with `UNSAFE_LOGGING` if it is true, because framework console logging would expose prompts.

**134 backend checks passed.** One actual B01 call completed in 9.35 seconds with one validated finding/walkthrough and 465 input / 500 output / 965 total tokens; thinking usage unknown. This is one synthetic review, not a latency SLA or resolved provider reliability. Multi-provider selection is the next chunk. [Official integration](https://docs.langchain.com/oss/javascript/integrations/chat/google).


### Framework setup — 14 November

Use existing `server/.env`; no frontend credentials or TypeScript migration. Gemini remains the default. One provider per review, no automatic fallback:

```dotenv
AI_PROVIDER=gemini
AI_MAX_RETRIES=0
# To select Mistral instead: AI_PROVIDER=mistral
MISTRAL_API_KEY=your-private-key
MISTRAL_MODEL=mistral-small-latest
# Groq is different from Grok/xAI. Select explicitly; keys are not interchangeable.
# To select Groq: AI_PROVIDER=groq
GROQ_API_KEY=your-private-key
GROQ_MODEL=openai/gpt-oss-120b
# To select Grok: AI_PROVIDER=xai, plus both values below
XAI_API_KEY=your-private-key
XAI_MODEL=your-accessible-model-id
```

`GEMINI_TIMEOUT_MS` is the existing shared review deadline (1–120000 ms) for all selected providers. Model availability is account-dependent. Mistral/Grok/Groq use the same JSON/evidence validators and saved report shape. Groq and xAI reuse LangChain's OpenAI-compatible adapter at their respective fixed API hosts; this does not send requests to OpenAI's API. Provider switching is explicit, with no automatic fallback. Changing providers does not regenerate old saved reports.

`AI_MAX_RETRIES=0` preserves one-request behavior. Opt in with `1` for at most two actual requests to the same provider within the original shared deadline. Only returned HTTP 502/503/504 or Groq's known HTTP 400 `json_validate_failed` qualify; the latter gets a short schema reminder without replaying failed output. Authentication, quota/429, ordinary bad requests, local evidence/response rejection and ambiguous client/network timeouts do not retry. Less than 1.5 seconds remaining also prevents retry. SDK retries remain disabled; report details retain actual attempt count and retry reason. Retries may consume extra quota/cost, and usage reports cover returned successful usage, not unknown work on failed attempts. Crash recovery still refuses to replay `model_started` checkpoints automatically. The local owner configuration currently opts in to one retry.

Local verification on **16 November 2026**: the real PR #3 was fetched using a GitHub App installation token, reviewed by Groq `openai/gpt-oss-120b`, validated and saved in MongoDB in about 8.9 seconds (model: 4.2 seconds). Six scoped LangGraph checkpoints were confirmed. This was a service-level verification, not a new webhook delivery or email/comment test. Gemini's exact adapter request also returned HTTP 504 through cURL; Mistral returned 429. Groq's 20B model returned a schema-validation error on the full review, so the verified 120B model is the Groq default. These individual runs do not establish provider reliability or AI quality scores.

Gemini follow-up, **16 November 2026** (unresolved): identical synthetic review requests with/without `x-server-timeout` returned HTTP 504 `DEADLINE_EXCEEDED` in 44.4 seconds / reached the 45-second client deadline. An isolated `MINIMAL` reasoning configuration also returned 504 in 44.7 seconds; the same adapter with `gemini-3.1-flash-lite` returned 503 in 2.9 seconds. These probes did not change the application configuration. A prior tiny cURL request did succeed, so this is not evidence that all Gemini inference is permanently unavailable or that LangChain is the root cause. No speculative timeout increase, automatic retry or fallback was added. Keep the verified provider selected; after upstream recovery, `npm run test:gemini --prefix server` checks connectivity, but a successful full PR review is still required before switching back. When reporting the issue to Google, include the model, UTC timestamp, deadline, HTTP status, sanitized request and elapsed time; exclude API keys, private source and authorization headers.

Webhook/comment follow-up, **16 November 2026**: GitHub confirmed an actual `opened` delivery redelivery to the public endpoint with HTTP 202. Public signed ping returned 200, bad signature 401, private report without a session 401, and public demo 200. A real App bot summary was posted to PR #3; repeating the summary call returned `existing` and GitHub showed exactly one matching comment. Two signed replay runs through the real Express handler and temporary MongoDB databases saved reports with `aiStatus=unavailable`; one exposed Groq HTTP 400 `json_validate_failed`. Replay kept one report and the same model run ID. The same PR/context subsequently completed through Groq in about six seconds, so AI reliability remains unresolved despite the earlier successful report. Temporary databases were removed. A fresh test commit was rejected with GitHub 403, leaving the fixture unchanged; a new `synchronize` delivery is unverified. SMTP credentials are absent, so email inbox delivery is unverified; nine selected offline checks for summaries, emails, revisions and webhook handling passed. Local bot summaries were enabled; email remains opt-in and unconfigured.

Optional Chroma semantic retrieval needs a separate persistent local service:

```powershell
docker run --detach --name prism-chroma -p 127.0.0.1:8010:8000 -v prism-chroma:/data chromadb/chroma:latest
```

Then add server-only settings:

```dotenv
REVIEW_RETRIEVAL=semantic
CHROMA_URL=http://127.0.0.1:8010
GEMINI_EMBEDDING_MODEL=gemini-embedding-001
```

Embeddings require `GEMINI_API_KEY`, even when Mistral/Grok generates the review. The retriever sends at most 16 sanitized chunks to embeddings and selects at most 4 original chunks, preserving source coordinates and existing context budgets. Cache scope includes installation/repository/base/head/model. A store/embedding failure retains bounded source context with an unavailable marker. Keep local Chroma private; a hosted store needs HTTPS/access control (`CHROMA_API_KEY` supplies `x-chroma-token` when that deployment supports it), persistence and a retention/cost decision. Chroma collections have no automatic TTL here; remove obsolete revision collections through the store's administration. Semantic retrieval stays off unless configured; no INR200 hosting guarantee.

**LangGraph recovery:** context -> request boundary -> model -> persist. Connected Mongo automatically stores scoped checkpoints with 24-hour TTL indexes; local memory fallback is not durable. Credentials/raw source windows are not checkpoint state. For an existing failed/unknown durable webhook job, a trusted operator can run:

```powershell
npm run worker --prefix server -- --resume webhook-<64-hex-id>
```

A checkpointed model result can resume report saving without another inference call. Unknown model outcomes and missing/expired checkpoints refuse replay; start a fresh deliberate review instead. A saved report is reused; already claimed notifications are not resent. A crash after saving may leave an optional notification unsent rather than risking duplicates.

**CI integration:** the workflow now starts local Mongo/Azurite and verifies duplicate queue delivery plus save recovery in a new Node process before container/deploy. To repeat locally with Mongo on 27017 and Azurite on 10001:

```powershell
$env:INTEGRATION_TESTS='true'
node --test --test-name-pattern="durable queue integration" server/test/webhook.test.js
Remove-Item Env:INTEGRATION_TESTS
```

The test generates/cleans its own database and queue; it makes no model calls. Hosted Actions/OIDC and Azure triggers still need acceptance. Provider, Chroma cache status and actual timings/tokens are visible in report details. See the roadmap for controlled live results and remaining manual work.


### Azure AI/homepage follow-up - 17 November

The current release serves the PRism homepage at the deployment root. Connect/install, start-review and saved-analysis controls live on that page; successful GitHub login returns there. Existing report URLs remain direct links.

The Malaysia West worker explicitly uses `gemini-3.1-flash-lite` with at most one transient retry within the original deadline. A live local review of PR #4 caught its intentional boolean bug with validated line evidence. Groq returned HTTP 403 from the Azure environment while working locally; the exact provider-side access rule is unconfirmed. Mistral returned 429 in the bounded local probe. No provider fallback or paid plan was enabled. The Azure image/config rollout succeeded and public homepage/health/login were verified; a subsequent real PR #4 commit verified cloud inference in Malaysia West: one attempt, 4,752 ms, saved `aiStatus=completed`, and the expected `||` -> `&&` finding at line 7. Existing failed-AI reports are saved revision snapshots and do not automatically rerun after a configuration change. Cold webhook delivery remains a separate limitation described above.
