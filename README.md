# PRism AI

**A pull request changes code. PRism helps you inspect what that change could mean.**

Paste a GitHub PR URL—or receive a signed PR webhook—and get a saved review with the actual diff, a change walkthrough, potential impact and findings linked to code evidence.

Built as a small MERN + Gemini project. Feedback is advisory: PRism does not run your repository tests, approve a merge or guarantee that a PR is safe.

[Feature status & next steps](docs/FEATURE_ROADMAP.md) · [UI direction](docs/UI_DIRECTION.md) · [Evaluation notes](docs/beta/DEMO_AND_EVALUATION.md)

> **Delivery status — 1 November 2026:** the current V0 is on the local `integration/v0-demo` branch. The remote repository currently exposes only `main`, which does not contain this full V0 yet. Publishing the integration branch and reviewing its PR are still pending. There is no verified public deployment URL.

## Take a 60-second tour

1. Open `/`: the introduction explains the workflow. **Try it for free** opens `/app`.
2. Paste a small accessible GitHub PR URL. Follow actual fetching, context, reviewing and saving stages; elapsed time is not a completion estimate.
3. Open the report: choose a changed file, inspect additions/deletions, then inspect the review or findings beside it.
4. Click an evidence reference to jump to its old/new diff line when that line is available.
5. Reopen the saved revision from `/analyses`.

**See a sample review** opens an existing completed report, preferring one with contextual AI feedback. It does not create a fake result or run a new model request. On a fresh database it explains that no sample exists yet.

A clean PR can have zero findings. A report can also have completed rule-based analysis while its AI review is unavailable. Those are different outcomes, and the UI keeps them separate.

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

The frontend currently calls `http://localhost:5000/api` directly. Changing only `PORT` will not reconfigure the frontend. Deployment configuration is a pending release task.

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

This version supports a **manually configured repository webhook**, not a public installable GitHub App yet.

1. Configure the webhook secret and allowed repository in `server/.env`; restart the backend.
2. Provide a public HTTPS endpoint forwarding **only** `/api/webhooks/github` to the local API. For local testing this can be a path-restricted tunnel. Do not publish the whole backend: manual report/analysis routes currently lack authentication.
3. In the configured GitHub repository, open **Settings → Webhooks → Add webhook**. Set the payload URL to `https://YOUR-HOST/api/webhooks/github`, content type to `application/json`, and secret to the exact server value. Keep SSL verification on; subscribe only to **Pull requests**.
4. In **Recent Deliveries**, confirm the signed `ping`: `200` with `{"status":"ready"}`.
5. Open a non-draft PR, push a new commit, reopen it or mark it ready for review. Eligible actions are `opened`, `synchronize`, `reopened` and `ready_for_review`.
6. Expect `202` plus an `analysisId`, then check backend completion logs and refresh **Analyses**. The report appears after saving; `202` acknowledges receipt, not model success.
7. **Redeliver** the same PR revision. A completed stored report is reused; it must not trigger another model review. A new base/head revision has a different report ID.

Useful responses: `401` invalid signature; `403` repository not enabled; `413` body exceeds 1 MiB; `503` unconfigured or busy. Signed irrelevant events and draft/closed PRs are ignored. PR comments, merge events and email notifications are not implemented.

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

Manual submission defaults to JSON. With `Accept: application/x-ndjson`, it streams progress frames and then one terminal result/error. The client does not automatically retry a generation request.

## Checks you can run

```powershell
# Backend offline suite: GitHub/Gemini calls are mocked in integration tests
npm test --prefix server

# Frontend API, rendering and diff checks; uses existing Vite JSX transformation
cd client
node --test test/analysis.api.test.js test/diff-viewer.test.js
cd ..

# Frontend production build
npm run build
```

`npm run test:gemini --prefix server` is a separate **live provider smoke test**. It consumes a real API request; it is not part of the offline suite.

Recorded verification from the implementation sessions: **91 backend tests**, **33 frontend checks**, backend syntax/local health and frontend production build passed. A temporary MongoDB check preserved patches/provenance and rejected a persisted webhook duplicate. These are recorded runs, not claims that this documentation edit reran them. The author also reported a live GitHub webhook → AI report flow and a successful redelivery check; that is manual demo evidence, not a labelled accuracy benchmark. Browser-driven visual/interaction QA remains incomplete.

## Know the limits before reading the results

- GitHub retrieval handles pagination up to its 3,000-file endpoint cap and rejects report snapshots over 4 MiB. Missing/binary patches are reported rather than invented.
- AI input is intentionally bounded: up to five reviewable files, a 12,000-character serialized diff-file budget and an 8,000-character context-snippet budget. JS/TS enrichment follows selected direct relative imports; it is not repository-wide semantic search.
- Recognizable secrets/sensitive paths are filtered from model input, but this is heuristic filtering, not a complete data-loss-prevention guarantee. Saved diffs may contain sensitive repository content; protect database access.
- Invalid references are rejected, but valid references can still support incorrect reasoning. No measured model accuracy is published yet.
- No dashboard/user authentication, per-installation report isolation, GitHub App install flow, GitHub review posting, MCP server or public deployment is complete yet. Webhook signature verification is already implemented.
- Hosting, database and AI-provider usage can have costs. Public source availability does not make unlimited hosted inference free. Project licensing is still a release decision; bundled font licenses apply to their assets.

## What comes next

**AI Evaluation V1**: use labelled bug and clean-change examples to measure review quality before adding more AI behavior. Then add actual token/prompt-version diagnostics, compare retrieval approaches and collect finding feedback.

In parallel, the recruiter-facing product path is **Install on GitHub → select repositories → authorize → automatic PR review**. That needs GitHub App installation authentication, installation-scoped access and secure report visibility before a public launch. MCP is an additional AI-client interface, not a replacement for GitHub event delivery.

Track acceptance criteria and completed work in [FEATURE_ROADMAP.md](docs/FEATURE_ROADMAP.md). Older phase/beta documents describe earlier milestones; use the roadmap as the current status source.
