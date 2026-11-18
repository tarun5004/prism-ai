# Setup and operations

This guide contains configuration details for the existing Node application and optional Python review agent. For current release evidence and pending acceptance checks, use [FEATURE_ROADMAP.md](FEATURE_ROADMAP.md). The [README](../README.md) separates the captured public sample from authenticated live reviews.

## 1. Local development

Prerequisites: Node.js 22.12+, npm, Python 3.12+ and uv for the agent. Docker Desktop is useful for MongoDB, Azurite and container checks.

From the repository root:

```powershell
npm ci
npm ci --prefix server
npm ci --prefix client
uv sync --project agent-service --frozen
```

Copy `server/.env.example` to `server/.env` **only on first setup**. Preserve existing credentials. Node loads this server-only file; Python does not automatically load it. Never put secrets in frontend variables, shell history, screenshots or committed parameter files.

```powershell
npm run dev
```

Open `http://localhost:5173/`; API health is `http://localhost:5000/api/health`. Vite proxies same-origin `/api` to port 5000. In production, Express serves the built frontend and API together, including deep links. `VITE_API_BASE_URL` is an optional build-time override; same-origin hosting simplifies session cookies.

For a database-free read-only sample, use the README's `DEMO_ONLY=true` commands. Clear demo-only mode before testing authentication, reviews or webhooks. Development memory fallback is volatile and is not a substitute for persistent auth, durable queues or restart tests.

### Persistent MongoDB

```powershell
docker run --detach --name prism-mongo -p 127.0.0.1:27017:27017 -v prism-mongo:/data/db mongo:8.0
```

Set `MONGODB_URI=mongodb://127.0.0.1:27017/prism-ai` in the private server environment. Production requires connected MongoDB. Sessions, OAuth state, review allowances, jobs, reports and checkpoints use persistence. Keep the same `SESSION_ENCRYPTION_KEY` across API/worker restarts and deployments; changing it invalidates encrypted records. Generate a private 32-byte base64 key locally:

```powershell
node -e "process.stdout.write(require('node:crypto').randomBytes(32).toString('base64'))"
```

Do not share the output. Use an authenticated, access-controlled database for hosted operation; the loopback container command is for local development.

## 2. GitHub App and session setup

Register a GitHub App and configure these URLs using your actual application origin:

| Setting | Value |
| --- | --- |
| Authorization callback | `https://YOUR-HOST/api/github/callback` |
| Post-install setup URL | `https://YOUR-HOST/` |
| Webhook URL | `https://YOUR-HOST/api/webhooks/github` |

Enable SSL verification, set a fresh webhook secret and enable user authorization during installation where offered. Install the App only on intended repositories.

Permissions and events:

- **Contents: read**, **Pull requests: read**, and metadata read for review access; subscribe to **Pull request** events.
- **Pull requests: write** for approved Python-agent summaries or optional legacy comments/inline reviews.
- **Issue comment** events for optional `@prism-ai` commands.
- **Commit statuses: read/write** only for the optional legacy advisory status; this is not the Checks API.
- Account **Email addresses: read** only for optional verified-address email. Reconnect after granting it.

Add these values to the protected server environment; placeholders below are not credentials:

```dotenv
APP_ORIGIN=https://YOUR-HOST
MONGODB_URI=YOUR_PRIVATE_CONNECTION_STRING
SESSION_ENCRYPTION_KEY=YOUR_BASE64_32_BYTE_KEY
GITHUB_APP_ID=YOUR_APP_ID
GITHUB_APP_SLUG=YOUR_APP_SLUG
GITHUB_APP_CLIENT_ID=YOUR_CLIENT_ID
GITHUB_APP_CLIENT_SECRET=YOUR_CLIENT_SECRET
GITHUB_APP_PRIVATE_KEY="YOUR_PEM_WITH_ESCAPED_NEWLINES"
GITHUB_WEBHOOK_SECRET=YOUR_RANDOM_SECRET
REVIEW_MONTHLY_LIMIT=100
REVIEW_ENGINE=legacy
```

`APP_ORIGIN` must match the browser origin, with no trailing slash or path; use `http://localhost:5173` for Vite development and HTTPS for production. PEM may contain literal `\n` escapes where the host cannot store real newlines. App mode uses scoped user/installation credentials and does not fall back to an owner's global token. `GITHUB_TOKEN` and `GITHUB_WEBHOOK_REPOSITORY=owner/repo` belong to the older, single-repository local mode.

Production also requires `NODE_ENV=production` and queue execution. Start the built application using `npm run build`, then `npm start --prefix server`.

After installation/login, test a non-draft PR in a selected repository, reopen its saved report, then remove repository access and confirm denial. A second-account test, real webhook delivery and external writes each require their own live acceptance; mocked contracts do not establish them.

### Webhook behavior

Eligible PR actions include `opened`, `synchronize`, `reopened` and `ready_for_review`. A signed `ping` should return 200. Queue mode returns 202 only after persisting a job and enqueueing its ID; inspect job/report status afterward. Redelivering the same revision must reuse its durable identity rather than trigger another inference.

Invalid signatures return 401; unavailable configuration/queue returns a safe error. Draft, closed and irrelevant events are ignored. A public endpoint must respond within GitHub's deadline: scaling from zero has exceeded that deadline in recorded tests. Inspect **Recent Deliveries** and deliberately redeliver failed events during controlled demos. Reliable unattended cold ingestion remains a separate acceptance gap.

## 3. Queue versus inline execution

Production uses `REVIEW_EXECUTION=queue`. The API stores jobs in MongoDB; Azure Storage Queue carries only the job ID. A worker obtains fresh GitHub installation credentials, atomically claims the job and handles one message before exiting. Queue delivery is at least once; a worker start limit is not a global concurrency guarantee.

For local queue development, start Azurite:

```powershell
docker run --rm --name prism-azurite -p 127.0.0.1:10001:10001 mcr.microsoft.com/azure-storage/azurite azurite-queue --queueHost 0.0.0.0 --skipApiVersionCheck
```

Set in the private server environment:

```dotenv
REVIEW_EXECUTION=queue
AZURE_STORAGE_CONNECTION_STRING=UseDevelopmentStorage=true
AZURE_REVIEW_QUEUE_NAME=prism-reviews
```

Create the emulator queue once, then run a worker when there is an accepted job:

```powershell
Push-Location server
node --input-type=module -e "import {QueueClient} from '@azure/storage-queue'; await new QueueClient('UseDevelopmentStorage=true','prism-reviews').createIfNotExists();"
Pop-Location
npm run worker --prefix server
```

The worker does not schedule itself. Run it again for another message; Azure's event job trigger provides scheduling when deployed. This Azurite container is temporary and loses queue data when removed. For Azure managed identity, configure `AZURE_REVIEW_QUEUE_URL` instead of a connection string and grant the API, worker and scaler their scoped queue roles.

Development inline mode runs within the API process with bounded concurrency; leave `REVIEW_EXECUTION` unset for that path. It is not accepted for production dispatch. `GET /api/analyses/:id/job` requires report authorization. A `completed` job means a report was saved; inspect its separate `aiStatus`.

### Recovery boundaries

Engine selection is pinned when each job is created; old jobs without a field remain legacy. Interrupted/uncertain model work becomes `unknown` rather than silently replaying. Existing Mongo checkpoints can resume saving a received model result without another model request:

```powershell
npm run worker --prefix server -- --resume webhook-<64-hex-id>
```

Use this only as a trusted operator after inspecting the job. Missing/expired checkpoints and unknown model outcomes refuse replay. Python has no durable mid-loop checkpoint recovery; a lost Python response can lose a completed result. A fresh deliberate review may incur another charge. See [the agent failure contract](PYTHON_REVIEW_AGENT.md#limits-and-failure-behavior).

## 4. Select the review engine

### Python agent

Keep GitHub credentials and durable jobs in Node. Set these independently in the appropriate process environments:

| Process | Required configuration |
| --- | --- |
| Node API/job creator | `REVIEW_ENGINE=python-agent` for newly created jobs |
| Node worker | `PRISM_AGENT_URL`, `PRISM_AGENT_SERVICE_TOKEN` |
| Python | Same `PRISM_AGENT_SERVICE_TOKEN` (32+ characters), `GEMINI_API_KEY`, explicit `PRISM_AGENT_MODEL` |

From `agent-service/`, after setting private environment variables:

```powershell
uv run uvicorn app.main:app --host 127.0.0.1 --port 8090 --no-access-log
```

For local Node, use `PRISM_AGENT_URL=http://127.0.0.1:8090`. Production permits the private internal Azure Container Apps HTTPS endpoint. Redirects, arbitrary hosts, query strings and URL credentials are rejected before sending the bearer token. Python does not automatically read `server/.env`.

The supported Gemini 3 path uses low planner thinking and medium final-review thinking. Optional `PRISM_AGENT_THINKING_LEVEL` accepts `minimal`, `low`, `medium`, `high` or `provider`; it does not raise request/time/tool budgets. More reasoning can consume more tokens and produce more false positives. `PRISM_AGENT_PRICES_JSON` enables an estimate only with explicit model, dated price and input/output rates; absent/incomplete usage is not a known bill.

Use the [free scripted fixture](PYTHON_REVIEW_AGENT.md#run-the-free-local-fixture) before real inference. Rollback new-job selection to `REVIEW_ENGINE=legacy`; keep Python available for already-pinned jobs. Do not rewrite queued jobs or replay unknown requests.

### Legacy Node engine

`REVIEW_ENGINE=legacy` retains the existing pipeline. Provider selection is explicit through `AI_PROVIDER=gemini|groq|mistral|xai`; there is no automatic provider fallback. Configure the selected provider's server-only key/model (`GEMINI_*`, `GROQ_*`, `MISTRAL_*` or `XAI_*`). Groq and Grok/xAI are different services with different credentials.

`GEMINI_TIMEOUT_MS` is the legacy shared review deadline, capped at 120,000 ms. `AI_MAX_RETRIES=0` disables application retries; `1` permits at most one narrowly classified retry within the original deadline. Auth/quota failures, ambiguous timeouts and rejected evidence do not automatically retry. These legacy settings do not replace the Python agent's own bounded request policy. Keep `LANGCHAIN_VERBOSE` false/unset; unsafe framework prompt logging fails closed.

## 5. Review controls and publishing

These optional legacy switches default off:

```dotenv
REVIEW_REPOSITORY_CONFIG=true
GITHUB_REVIEW_COMMANDS=true
GITHUB_POST_REVIEW=false
GITHUB_POST_INLINE=false
GITHUB_POST_STATUS=false
```

Commands require fresh write/maintain/admin permission. Prefix each with `@prism-ai`: `help`, `review`, `full review`, `pause`, `resume`, or `summary`. Pause persists for future automatic work; it does not cancel an already-running request. Resume enables future events without immediately reviewing. Deliberate review commands bypass pause once and consume normal allowances. Edited command comments are ignored; a new deliberate run needs a new comment.

Incremental reviews use a compatible successful baseline with matching installation/PR/base and proven ancestry. Force-pushes, changed bases or missing history fall back to full review. Manual UI reviews remain full. Optional `.prism.json` is read at the base SHA; paths are literal files or directory prefixes, not globs:

```json
{
  "autoReview": true,
  "ignorePaths": ["vendor/", "generated/", "package-lock.json"],
  "pathInstructions": [
    { "path": "server/src/", "instructions": "Check resource ownership before updating records." }
  ]
}
```

The config is limited to 8 KiB, 20 ignored paths and 10 guidelines of 500 characters. Missing config uses defaults; malformed/unavailable enabled policy fails closed. Instructions cannot expand permissions or prove bugs.

Legacy inline feedback posts at most five validated AI findings as an advisory `COMMENT` review. Optional commit status describes advisory completion, not merge safety. Do not use it as a required safety gate. **Python-agent reports suppress these automatic writes**; they require approval of the fixed server-generated summary instead. Fresh permissions, open PR and matching base/head are checked; unknown publications only reconcile. See [human approval](PYTHON_REVIEW_AGENT.md#human-approval).

Review allowances count starts rather than tokens or money. The monthly default is 100; deployment can choose a lower limit. Neither this counter nor a budget alert is a billing cap.

## 6. Optional review-ready email

Nodemailer needs a real SMTP service and verified sender; it does not supply a mailbox or delivery plan. Configure privately:

```dotenv
EMAIL_ENABLED=true
EMAIL_FROM=verified-sender@example.com
SMTP_HOST=your-smtp-host
SMTP_PORT=587
SMTP_USER=your-smtp-user
SMTP_PASS=your-smtp-password
```

Supported ports are 587 with STARTTLS or 465 with TLS. Restart/recreate affected processes after changing their environment. Grant GitHub account **Email addresses: read**, reconnect, then explicitly enable **Review-ready emails**. The server derives a verified recipient from GitHub and rechecks repository access; request-supplied recipients are ignored.

Manual reviews notify the connected requester; webhook reviews notify an author only if connected and opted in. The message contains status and an access-controlled report link, not source. Session expiry/logout ends authorization; no background OAuth refresh is implemented. Mail failure preserves the report; uncertain SMTP outcomes are not automatically resent. SMTP authentication and inbox delivery need separate live verification.

## 7. Optional legacy retrieval and local MCP

`REVIEW_GUIDANCE=lexical` ranks bounded README/CONTRIBUTING context, sharing existing source-read budgets. Optional legacy semantic retrieval requires persistent Chroma plus Gemini embeddings:

```powershell
docker run --detach --name prism-chroma -p 127.0.0.1:8010:8000 -v prism-chroma:/data chromadb/chroma:latest
```

```dotenv
REVIEW_RETRIEVAL=semantic
CHROMA_URL=http://127.0.0.1:8010
GEMINI_EMBEDDING_MODEL=gemini-embedding-001
```

Embeddings require `GEMINI_API_KEY`, even when another provider generates reviews. They may incur cost. Retrieval embeds at most 16 sanitized chunks and selects at most four with original coordinates. Cache scope includes installation/repository/base/head/model; failures retain bounded source context with an unavailable marker. Chroma collections have no automatic TTL here. Hosted operation needs persistence, retention and HTTPS/access control; `CHROMA_API_KEY` supplies `x-chroma-token` where supported. The Python agent uses lexical matching over supplied chunks and does not use this store.

For offline retrieval experiments: `node server/scripts/evaluate-ai.js --retrieval-experiment --out NEW_PATH.json`. Adding `--semantic` makes real embedding requests; it is excluded from offline verification.

The optional read-only stdio MCP process is `node /ABSOLUTE/PATH/TO/prism-ai/server/scripts/mcp.js`. Configure it in a trusted local MCP host. It loads the private server environment; independent processes require MongoDB to read saved reports. Tools are `list_reports` and `read_report`; `DEMO_ONLY=true` exposes only `read_demo_report`. `MCP_INSTALLATION_ID` is a trusted operator scope, not public authentication. Do not expose this process as an unauthenticated network service. It cannot generate reviews or write GitHub comments.

## 8. Containers and Azure

```powershell
docker build -t prism-ai:local .
docker build -t prism-agent:local agent-service
docker run --rm -p 5000:5000 -e DEMO_ONLY=true prism-ai:local
```

The Node image runs the API by default; worker command is `node server/scripts/review-worker.js`. Both need the same durable settings and session encryption key. Python has its own non-root image. For host MongoDB inside Docker use `host.docker.internal`; Azurite needs an explicit container-reachable queue endpoint rather than the loopback `UseDevelopmentStorage=true` shortcut.

[infra/main.bicep](../infra/main.bicep) uses the existing Container Apps Consumption environment, web app, event worker, queue and managed identities. Optional Python-agent configuration adds private HTTPS ingress with zero minimum replicas; only the worker receives its URL/token. Keep provider credentials in the process that actually calls the provider. The API/worker and agent use separate immutable image references.

For a manual release, compile Bicep, review what-if, then apply only to the intended existing subscription/resource group. Preserve the session encryption key and stateful resources. Keep local ARM parameters ignored; never print secure parameter objects. Agent parameters include `reviewEngine`, `agentImage`, `agentModel`, secure `agentServiceToken` and `agentApiKey`; consult the template for the full current contract.

Use deployment outputs for the GitHub URLs. Refresh MongoDB network access from actual environment outbound connectivity and allow role assignments to propagate. A scale-to-zero target is not a shutdown timer; worker scaling limits starts per polling interval rather than all simultaneous jobs. Compute startup/cooldown, queue storage, databases, model tokens and optional services have separate costs.

The [GitHub Actions workflow](../.github/workflows/checks.yml) documents the manual gated release path. Configure Azure OIDC, the protected `production` environment and required repository/environment variables for the intended resources; inspect the workflow for exact names. Updating Python, API and worker is sequential, not an atomic release. Hosted workflow success must be verified separately from local checks/manual deployment.

Acceptance includes public health/sample, authenticated access, a real newly queued agent review, duplicate-event behavior, saved report after restart, worker exit and scale-down. Health/sample 200 alone does not establish Python inference. Roll back new jobs to legacy and prior immutable images if needed; do not replay uncertain jobs.

## Verification

Run `powershell -ExecutionPolicy Bypass -File scripts/verify-local.ps1` from the root for Python tests/Ruff, backend tests, frontend contract/render tests, scorer tests and client build. This uses scripted/mocked external services.

With MongoDB and Azurite running, add `-Integration` for isolated persistence, duplicate delivery and process-restart recovery checks; add `-Docker` for both image builds. Integration fixtures clean their own database/queue and do not call a model. Without integration opt-in, skipped integration tests are not passing live-service evidence.

The agent's offline evaluator lives outside runtime code:

```powershell
Push-Location agent-service
uv run python -m evaluations.run --output "$env:TEMP/prism-agent-scripted.json"
Pop-Location
```

Use a fresh output path. Scripted results test the harness rather than finding quality. Live mode requires explicit `--mode live --allow-paid` and configured Python credentials; do not include it in routine checks. Independent exact-run judgments are required for precision/recall; unjudged scores remain unknown. See [evaluation details](PYTHON_REVIEW_AGENT.md#evaluation-and-observability).

`npm run test:gemini --prefix server` is a separate real provider connectivity smoke. Connectivity is not a full PR review, and successful inference is not proof of GitHub delivery, email delivery or broad review accuracy.
