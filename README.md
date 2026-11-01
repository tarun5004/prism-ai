# PRism AI

PRism is a small MERN beta that turns a GitHub Pull Request into an evidence-backed review report.

It helps a reviewer see changed files, simple risk signals, supporting evidence, and recommended review actions. PRism supports human review; it does not approve, block, or merge Pull Requests automatically.

## Stack

- MongoDB for persistence
- Express and Node.js for the API
- React with Vite for the dashboard
- Plain JavaScript for an easy-to-follow implementation

## Current Beta

The beta flow is:

`Pull Request URL -> GitHub metadata and diff -> simple rules -> optional AI -> review report`

The current rule categories are:

- Hidden impact
- Breaking change
- Test gap
- Security concern

MongoDB is optional for local development. Without a MongoDB connection string, the server uses in-memory analysis history.

## Structure

```text
client/
  src/
    app/
    features/
server/
  src/
    config/
    features/
      ai/
      analysis/
      health/
      pullRequest/
```

Each feature owns its routes, controllers, and UI where applicable. Shared code should be added only when more than one feature needs it.

## Run

```bash
npm run install:all
npm run dev
```

The client runs on `http://localhost:5173` and the API runs on `http://localhost:5000`.

## Environment

Copy the server example file before configuring integrations:

```bash
copy server\.env.example server\.env
```

Available values:

- `PORT`: API port, default `5000`
- `MONGODB_URI`: optional MongoDB connection string
- `GITHUB_TOKEN`: optional token for GitHub API access
- `AI_API_URL`: optional JSON AI provider endpoint
- `AI_API_KEY`: optional AI provider key

Never commit `server/.env` or credentials.

## Automatic PR reviews with a GitHub webhook

The same review pipeline supports manual URLs and verified GitHub events. It does not post comments to GitHub or merge code. Results appear in **Analyses**; refresh that page after a webhook review finishes.

1. In `server/.env`, configure `GITHUB_WEBHOOK_SECRET` (a random private value) and `GITHUB_WEBHOOK_REPOSITORY=owner/repository`. The local setup may already contain generated values: preserve them. Only this repository is accepted. A fork PR targeting it is supported when the existing GitHub token can read the necessary code. Restart the backend after changing environment values.
2. Keep the API running as a long-lived Node process. Provide a public **HTTPS** URL that forwards `/api/webhooks/github` to the local backend. Use a tunnel/reverse proxy restricted to this path. Do not expose the complete demo API: its manual analysis endpoints currently have no authentication. Tunnel software/remote webhook registration is an operator setup step, not performed by the application.
3. In your repository, open **Settings → Webhooks → Add webhook**. Use your HTTPS URL plus `/api/webhooks/github`, content type `application/json`, and the exact server `GITHUB_WEBHOOK_SECRET`. Keep SSL verification enabled. Choose individual events → **Pull requests**, then activate the webhook. You need repository webhook administration access.
4. A signed `ping` returns `200` with `status: ready`. In GitHub's **Recent Deliveries**, inspect the HTTP status. Invalid signatures return `401`; a different repository returns `403`; missing configuration or a busy reviewer returns `503`. Bodies over 1 MiB return `413`.
5. Open a non-draft PR, push a new commit (`synchronize`), reopen it or mark it ready for review. Eligible events return `202` with an `analysisId` immediately. This acknowledges receipt, **not** AI success. The existing GitHub fetch, context extraction, rules, Gemini validation and save run afterward. Completion is logged with the report ID and honest AI status, without credentials or raw upstream errors.
6. Open `/analyses` in PRism after processing, or `/analyses/<analysisId>` once saved. Existing diff/evidence rendering is unchanged. AI failure still preserves rule-based findings. If the PR revision changed before retrieval, a failed `REVISION_CHANGED` report is saved instead of reviewing the wrong revision.

Duplicate deliveries/actions for the same repository, PR, base SHA and head SHA reuse a deterministic report ID. Concurrent duplicates do not start another review; saved reports suppress repeated processing after a restart when MongoDB is connected. Use MongoDB for restart-safe history. A saved failure is also deduplicated; use manual URL analysis for an intentional retry of that revision.

Demo limits: at most two webhook jobs run simultaneously; excess events return `503`. There is no durable queue, automatic retry, missed-event recovery or multi-process coordination. If Node stops after acknowledging but before saving, use GitHub **Redeliver** after restarting. Redeliver busy/rejected deliveries after resolving their cause. GitHub's accepted delivery status alone does not prove that analysis completed. Older queued events can become stale when new commits arrive.

Offline verification: `cd server` then `npm test`. Webhook tests sign synthetic payloads, test the actual local HTTP receiver, mock external GitHub responses and verify stored patches/provenance. They make no live GitHub/Gemini requests. For live setup, confirm the signed ping first, then raise one small PR and inspect both its delivery and saved report.

References: [GitHub webhook signature validation](https://docs.github.com/en/webhooks/using-webhooks/validating-webhook-deliveries), [delivery and acknowledgement practices](https://docs.github.com/en/webhooks/using-webhooks/best-practices-for-using-webhooks).

## API

| Method | Endpoint | Purpose |
| --- | --- | --- |
| `GET` | `/api/health` | Check that the API is running |
| `GET` | `/api/analyses` | List recent analyses |
| `GET` | `/api/analyses/:analysisId` | Open one saved analysis |
| `POST` | `/api/analyses` | Analyze a GitHub Pull Request URL |
| `POST` | `/api/webhooks/github` | Receive signed repository PR events |

Example request:

```json
{
  "pullRequestUrl": "https://github.com/org/repository/pull/42"
}
```

## Architecture Rules

- Keep backend code organized by feature.
- Keep routes, controllers, services, and repositories close to their feature.
- Keep the report shape stable between rules, AI, API, and React.
- Add comments to new functions when their purpose is not immediately obvious.
- Prefer a small understandable function over a general abstraction.

## Beta Scope

Included: manual Pull Request submission, GitHub retrieval, four simple rule checks, optional structured AI findings, history, and an evidence-first dashboard.

Deferred: webhooks, Redis workers, CI/CD merge gates, multiple repository providers, AST analysis, cloud deployment, organization accounts, and advanced analytics.

See [docs/PRISM_BETA_V0_REQUIREMENTS.md](docs/PRISM_BETA_V0_REQUIREMENTS.md), [docs/PRISM_BETA_V0_PLAN.md](docs/PRISM_BETA_V0_PLAN.md), and [docs/beta/DEMO_AND_EVALUATION.md](docs/beta/DEMO_AND_EVALUATION.md) for the detailed plan.

## Delivery Rule

Work is delivered one small task at a time. Each completed task is validated and committed before the next task begins.
