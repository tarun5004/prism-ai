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

## API

| Method | Endpoint | Purpose |
| --- | --- | --- |
| `GET` | `/api/health` | Check that the API is running |
| `GET` | `/api/analyses` | List recent analyses |
| `GET` | `/api/analyses/:analysisId` | Open one saved analysis |
| `POST` | `/api/analyses` | Analyze a GitHub Pull Request URL |

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