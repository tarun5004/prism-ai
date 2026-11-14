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

Use your project region's HTTPS origin. This implemented slice uses no tracing SDK, LangChain, LangGraph or vector database. Their new planned roles are listed in the current roadmap.

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

Stack: React 19, Vite, plain CSS, Express 5, Mongoose/MongoDB and LangChain `@langchain/google` for Gemini review/connectivity. Google's `@google/genai` remains for the separate embedding experiment. Azure Storage Queue supports optional local queue testing and the production worker path; Mistral/Grok, LangGraph and ChromaDB integration remain planned.

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
2. Set the authorization callback and post-install setup URL to `https://YOUR-HOST/api/github/callback` and `https://YOUR-HOST/app` respectively. Set the webhook URL to `https://YOUR-HOST/api/webhooks/github`, enable SSL verification and use a new shared secret. Enable user authorization during installation if offered.
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

No cloud resources or public image were created. Proposed shape: Container Apps Consumption web service with minimum replicas zero, Storage Queue, and an event-triggered Container Apps Job running the worker. Persist reports/auth/jobs in MongoDB. Use the same encryption key and necessary server secrets for both commands. Deployed queue access uses managed identity and `AZURE_REVIEW_QUEUE_URL`; remove the local connection string. Configure queue data permissions for API sending and worker receiving/deleting, plus the scaler's queue access.

Start with one concurrent worker execution, no platform execution retries and an execution timeout shorter than the 900-second visibility/ownership lease. Account for worst-case GitHub/context/model work when choosing that timeout. Configure queue scaling explicitly; the one-shot script does not schedule itself. Keep logs bounded and avoid always-on VMs, Redis and a paid registry. Set INR50/100/150/200 budget alerts; alerts notify and do not stop spending. Verify regional costs/allowances before provisioning; student credits do not guarantee INR200/month.

The existing [workflow](.github/workflows/checks.yml) runs tests, builds the image and checks its public sample. Only a manual run with `deploy=true` on `integration/v0-demo` publishes a SHA-tagged GHCR image and reaches the protected `production` environment. Configure required reviewers for that environment and Azure OIDC federation for this repository/environment. Set these repository/environment variables:

- `AZURE_CLIENT_ID`, `AZURE_TENANT_ID`, `AZURE_SUBSCRIPTION_ID`
- `AZURE_RESOURCE_GROUP`, `AZURE_APP_NAME`, `AZURE_WORKER_JOB_NAME`

Provision the web app, queue, identity/scaler and worker job separately first; CD only updates existing images. Make the GHCR image public if Azure pulls anonymously. Grant the deployment identity access only to the intended resources. Hosted Actions/OIDC and actual deployment remain untested; the workflow was parsed locally. Both image updates are sequential, not an atomic release, so inspect both resources after deploying.

**Next manual acceptance:** register/install/connect the GitHub App → opt in → open a PR → enqueue → run worker → inspect saved report/email status → replay → confirm no second review → remove repository access and confirm denial. Then test actual SMTP, a second account, browser layouts and hosted triggers before calling the live release complete.


### Next agreed AI learning features — 14 November

LangChain Gemini review/connectivity is implemented. Mistral/Grok provider integration, ChromaDB semantic RAG and LangGraph state/checkpoints remain required next slices, **not implemented today**. Extend the existing context, feedback memory, validators, report and tracing; do not create a parallel review system. See the [comparison and single backlog](docs/FEATURE_ROADMAP.md#comparison-new-request-versus-existing-features). Earlier dated direct-SDK/no-vector notes describe current implementation, not a permanent exclusion.


### LangChain Gemini chunk — 14 November

Review and connectivity now call LangChain `ChatGoogle` from the recommended `@langchain/google` integration. It uses native JSON schema; the same application validators still reject unsupported code evidence. No new application files or API-key settings. Retries remain off and deadlines/bounded output remain enforced. Original provider token counts are preserved; ambient LangSmith prompt tracing is disabled, while optional metadata-only Langfuse export continues. Keep `LANGCHAIN_VERBOSE` unset/false: private calls fail closed with `UNSAFE_LOGGING` if it is true, because framework console logging would expose prompts.

**134 backend checks passed.** One actual B01 call completed in 9.35 seconds with one validated finding/walkthrough and 465 input / 500 output / 965 total tokens; thinking usage unknown. This is one synthetic review, not a latency SLA or resolved provider reliability. Multi-provider selection is the next chunk. [Official integration](https://docs.langchain.com/oss/javascript/integrations/chat/google).
