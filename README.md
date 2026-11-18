# PRism AI

**A GitHub pull-request review dashboard built with React, Express and MongoDB.**

Submit a PR URL to inspect changed files, transparent risk signals and optional AI findings in one report. Each finding includes an explanation, evidence, affected files and a recommended review action.

PRism assists a human reviewer. It does not approve or merge PRs automatically, and a heuristic finding is a review prompt rather than proof of a bug.

## How it works

```text
PR URL -> GitHub metadata and file diffs -> rule checks + optional AI endpoint
                                        -> normalized report -> history + dashboard
```

- Fetches PR metadata and up to 100 changed files through the GitHub API.
- Flags API-facing changes, security-sensitive changes, possible test gaps and broad diffs using readable rules.
- Optionally requests additional findings from a configured JSON AI endpoint and normalizes the response.
- Stores analysis history in MongoDB when available, with an in-memory fallback for local development.
- Shows findings, changed files, evidence and analysis status in a React dashboard.

## Stack and structure

| Area | Implementation |
| --- | --- |
| Dashboard | React, Vite, JavaScript |
| API | Node.js, Express |
| Persistence | MongoDB, Mongoose; in-memory fallback |
| Integrations | GitHub REST API, optional JSON AI endpoint |

```text
client/src/          Dashboard and application entry points
server/src/config/  Database connection
server/src/features/
  pullRequest/      GitHub retrieval
  analysis/         Rules, HTTP handlers and persistence
  ai/               Optional AI endpoint and finding normalization
docs/               Beta requirements, implementation plan and demo notes
```

## Run locally

Use Node.js 22 or newer and npm.

```bash
git clone https://github.com/tarun5004/prism-ai.git
cd prism-ai
npm run install:all
```

Copy `server/.env.example` to `server/.env` and configure the integrations you want. In PowerShell:

```powershell
Copy-Item server/.env.example server/.env
```

| Variable | Purpose |
| --- | --- |
| `PORT` | API port; defaults to `5000` |
| `MONGODB_URI` | Optional persistence; leave empty for in-memory history |
| `GITHUB_TOKEN` | Optional GitHub API token, including access to private repos it is permitted to read |
| `AI_API_URL`, `AI_API_KEY` | Optional JSON AI endpoint and its key; both are required to enable AI findings |

```bash
npm run dev
```

Open the dashboard at `http://localhost:5173`; the API runs at `http://localhost:5000`. Never commit local environment files or credentials. Review the configured provider's data handling before sending private code to it.

## API

| Method | Endpoint | Purpose |
| --- | --- | --- |
| `GET` | `/api/health` | Health check |
| `POST` | `/api/analyses` | Analyze `{ "pullRequestUrl": "https://github.com/org/repo/pull/42" }` |
| `GET` | `/api/analyses` | List recent analyses |
| `GET` | `/api/analyses/:analysisId` | Read a saved report |

## Current scope

This repository's default branch contains the manual-submission beta. Rules inspect paths and diff text; they do not perform AST analysis or prove a vulnerability. The GitHub file request does not paginate beyond its first 100 files. In-memory history resets on restart, and AI analysis is skipped when unconfigured or marked unavailable on provider failure.

Webhooks, signed GitHub App delivery, automatic reviews and provider-specific workflows are not part of this published beta. The API is intended for local development and needs authentication and other deployment controls before public exposure. There is no automated test script in this branch; `npm run build` builds the dashboard but does not verify GitHub or AI integrations.

## Project notes

- [Beta requirements](docs/PRISM_BETA_V0_REQUIREMENTS.md)
- [Implementation plan](docs/PRISM_BETA_V0_PLAN.md)
- [Demo and evaluation](docs/beta/DEMO_AND_EVALUATION.md)
