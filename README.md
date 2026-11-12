# PRism AI

**A pull request changes code. PRism helps you inspect what that change could mean.**

Paste a GitHub PR URL—or receive a signed PR webhook—and get a saved review with the actual diff, a change walkthrough, potential impact and findings linked to code evidence.

Built as a small MERN + Gemini project. Feedback is advisory: PRism does not run your repository tests, approve a merge or guarantee that a PR is safe.

[Feature status & next steps](docs/FEATURE_ROADMAP.md) · [UI direction](docs/UI_DIRECTION.md) · [Evaluation notes](docs/beta/DEMO_AND_EVALUATION.md)

> **Delivery status — 2 November 2026:** the current V0 is on the local `integration/v0-demo` branch. Remote `main` does not contain this full V0; the integration branch is not published yet. Publishing it and reviewing its PR remain release steps. There is no verified public deployment URL.

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

The new slices keep the existing direct Gemini SDK and MongoDB architecture:

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

Use your project region's HTTPS origin. No tracing SDK, LangChain, LangGraph or vector database is required for these bounded demo features.

Latest executed checks: **120 backend**, **7 Python evaluation**, **38 frontend** passed; production build passed. Actual production-mode HTTP checks returned 200 for health, the public sample and `/demo`, and 503 for private analysis GET/POST in demo-only mode. Independent review found no important/critical defects. Browser interaction, real Langfuse ingestion and hosted GitHub onboarding remain unverified. These results supersede the earlier dated verification below; they do not establish model accuracy.

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
| `MONGODB_URI` | Persistent reports. Missing URI or connection failure falls back to memory; memory is lost on restart |
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

Useful responses: `401` invalid signature; `403` repository not enabled; `413` body exceeds 1 MiB; `503` unconfigured or busy. Signed irrelevant events and draft/closed PRs are ignored. Optional App summaries are described below; merge events and custom email delivery are not implemented.

At most two webhook jobs run concurrently in the same Node process. There is no durable queue or automatic retry. If the server stops after acknowledging but before saving, redeliver after restart. MongoDB preserves final-report deduplication across restarts; in-memory mode does not. Saved failed revisions are also deduplicated—use manual URL analysis for an intentional retry. Multiple backend replicas are not supported by this deduplication design.

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
| [ai.service.js](server/src/features/ai/ai.service.js) | Gemini structured output, prompt, validation and diagnostics |
| [analysis.repository.js](server/src/features/analysis/analysis.repository.js) / [model](server/src/features/analysis/analysis.model.js) | Report storage |
| [pullRequest.webhook.js](server/src/features/pullRequest/pullRequest.webhook.js) | Signature checks, event filtering and bounded dispatch |

Stack: React 19, Vite, plain CSS, Express 5, Mongoose/MongoDB and Google's official `@google/genai` SDK. No diff editor, vector database, worker queue or agent framework is needed for the current flow.

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

Deployment goal: a zero-recurring-cost recruiter demo, subject to verified free/student eligibility and operational limits. No paid host or public deployment was created by this evaluation slice. Provider API quota/billing is separate from consumer subscriptions.

Track acceptance criteria and completed work in [FEATURE_ROADMAP.md](docs/FEATURE_ROADMAP.md). Older phase/beta documents describe earlier milestones; use the roadmap as the current status source.

## GitHub App setup (owner actions)

Code is implemented; no real GitHub App was registered or installed by this development run.

1. Register an App in GitHub developer settings. Use **Contents: read**, **Pull requests: read**, metadata read and the **Pull request** event. For optional summary comments only, choose Pull requests: write.
2. Set the authorization callback and post-install setup URL to `https://YOUR-HOST/api/github/callback` and `https://YOUR-HOST/app` respectively. Set the webhook URL to `https://YOUR-HOST/api/webhooks/github`, enable SSL verification and use a new shared secret. Enable user authorization during installation if offered.
3. Create the client secret and App private key. Add these server-only values to the host's protected environment; never paste a real key into documentation:

```dotenv
NODE_ENV=production
APP_ORIGIN=https://YOUR-HOST
MONGODB_URI=YOUR_PRIVATE_CONNECTION_STRING
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

4. Build using `npm ci --prefix server`, `npm ci --prefix client`, then `npm run build --prefix client`. Start with `npm start --prefix server` from the repository root. Use a single long-lived Node instance that supports public HTTPS webhooks. Production refuses memory-only storage and missing App configuration.
5. Open the site, install on selected repositories, then connect GitHub. Open/update a non-draft PR and check the saved report. Remove repository access and confirm it cannot be reopened. Repeat with another account. These are required live checks, not inferred from mocked tests.

Sessions and review limits live in one process; restart signs users out and resets counters. Authorization checks GitHub afresh before report reads and feedback writes. The demo permits six review starts per user/installation per hour, thirty globally and two concurrent webhook jobs. These guards are not a provider billing cap. Public model usage still needs provider-side controls. A rate-limited acknowledged webhook is logged for later redelivery rather than automatically retried.

`GITHUB_POST_REVIEW=true` enables one advisory bot summary/link per installation/repository/base/head revision. It scans at most 300 existing comments, posts after saving, never approves or merges, and records failed delivery without erasing the report. Grant PR write only when enabling it. No real summary was posted during verification.

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

Fresh checks: **122 backend**, **38 frontend**, **7 Python** checks and production build passed. Public demo API/SPA/health returned 200; demo-only private history returned 503. Existing environment changes were preserved, no new dependencies/application files were added. See the [capability audit and priorities](docs/FEATURE_ROADMAP.md#ai-capability-audit-and-priorities) before choosing another framework.
