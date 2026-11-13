# PRism AI — quick revision ☕

**13 Nov 2026 · Goal:** Code changes, possible bugs aur impact explain karna—with evidence. AI advisory hai; merge approval nahi.

`PR link / webhook → GitHub diff → relevant context → rules + Gemini → validate → save → report`

## Features: kya, kaise, problem → solution

| Feature | Humne kaise build kiya / problem handle ki |
| --- | --- |
| **PR fetch** | `pullRequest.service.js`: paginated GitHub files/patches + revision. Missing/binary patches explicitly unavailable. |
| **Diff viewer** | `DiffViewer.jsx`: hunk headers parse karke correct old/new line numbers; additions/deletions highlight. Multiple hunks aur incomplete patches handle kiye. |
| **AI review** | `ai.service.js`: official Gemini SDK + JSON Schema; summary, walkthrough, impact aur findings. Unknown files/lines ya mismatched evidence reject kiya. |
| **Context retrieval** | `ai.context.js` + PR service: source windows, imports, opt-in docs search. Long docs chunk kiye; budgets se input bounded rakha. |
| **Rule-based checks** | `analysis.rules.js`: simple risk signals. Gemini fail ho toh bhi rules/diffs available; AI failure separately show hota hai. |
| **Saved history** | Analysis model/repository: report/diff/revision save. MongoDB persistent; local memory restart pe lost. Old revisions preserve ki. |
| **Feedback + memory** | Useful/Incorrect labels save; same PR/installation ki previous revision se max 3 useful hints. Old feedback ko current bug evidence nahi maana. |
| **Progress + diagnostics** | NDJSON streams real stages; timing, tokens, serialized context size. Missing usage = unknown. |
| **Langfuse tracing** | `exportReviewTrace()`: optional metadata-only OTLP export. Code/prompts export nahi; tracing fail ho toh review discard nahi hota. Live ingestion verification pending. |
| **Automatic webhook review** | `pullRequest.webhook.js`: HMAC verification, shared pipeline, duplicate-revision reuse. Two jobs max; crash recovery needs redelivery. |
| **GitHub connect + summary** | `github.app.js`: state/PKCE login, server sessions, repo access checks; optional PR comment. Live App onboarding/comment verification pending. |
| **UI + public demo** | Separate routes, landing, history, report/evidence navigation. Recorded sample lets recruiter explore without creating a PR. |
| **Evaluation + embeddings** | Frozen test cases + Python scorer; SDK embeddings/cosine experiment. Human accuracy labels pending; tiny retrieval experiment is not review accuracy. |

## “Without MongoDB sample” means?

Socho **saved demo recording**, fresh review nahi. `/demo` reads test code + actual recorded Gemini output from JSON files. `loadDemoReport()` verifies hash/evidence; existing UI renders it.

**No DB/login/new AI call.** Persistent PR history still needs MongoDB. `DEMO_ONLY=true` disables private/live operations.

## MCP: exact file aur code flow

**Server:** [server/scripts/mcp.js](../server/scripts/mcp.js)

`Compatible AI client → stdio connection → discover tool → call tool → JSON report`

1. `new McpServer(...)`: official SDK creates server.
2. `registerTool(...)`: validates input; handler calls existing report functions.
3. `StdioServerTransport`: stdin/stdout messages; SDK handles handshake/discovery.

**Normal tools:** `list_reports`, `read_report` → scoped MongoDB reports. Invalid IDs/out-of-scope reads reject.

**Demo mode:** only `read_demo_report` → recorded sample, no MongoDB. Real stdio client/server test passed.

MCP khud model nahi hai: compatible client report ko AI context mein use karta hai. Every AI app compatible nahi. [Client setup](../README.md#local-read-only-mcp).

## Advanced features: abhi kya pending hai?

- **Chroma:** persistent semantic search; current experiment vectors store nahi karta.
- **LangChain:** adapters; abhi direct SDK sufficient.
- **LangGraph:** checkpoints/branching/pause-resume; current workflow crash-resumable nahi.
- **Durable queue:** jobs restart ke baad resume. Abhi memory-only; Kubernetes unnecessary.
- **Remote MCP/registry:** hosted authenticated connector/listing; abhi local stdio.
- **Verification:** hosting, GitHub App, Langfuse, desktop MCP, browser QA, human scoring.

**Reality check:** 12 Nov: one live review passed, another got provider HTTP504. Live reliability unresolved; framework installation verified fix nahi.

**Interview one-liner:** “I built a grounded PR-review workflow with bounded retrieval, validated evidence, revision memory, diagnostics and read-only MCP tools.”

Detailed status: [FEATURE_ROADMAP.md](FEATURE_ROADMAP.md). Main flow: [analysis.service.js](../server/src/features/analysis/analysis.service.js).
