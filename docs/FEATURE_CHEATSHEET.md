# PRism AI — humne actually build kaise kiya?

**13 Nov 2026.** Ek section at a time padho. Pattern: input lo → process/verify karo → result return karo → failure handle karo.

## 1. PR fetch + diff viewer

User ke URL se owner/repo/PR number extract kiya. GitHub PR endpoint se metadata, files endpoint se patches liye; next page ho toh fetch continue kiya. Commit IDs save kiye taaki reviewed version clear rahe.

Patch mein `+` added, `-` deleted aur space unchanged line hai. Header se old/new starting numbers milte hain. Do counters rakhe: addition par new, deletion par old, unchanged par dono increment. React coloured rows render karta hai. Missing patch par message, guessed code nahi.

**How I'd explain:** “I fetched GitHub's actual patch and tracked old/new positions separately so deleted lines also point to the correct location.”

Code: [fetchPullRequest()](../server/src/features/pullRequest/pullRequest.service.js), [DiffViewer.jsx](../client/src/features/dashboard/DiffViewer.jsx).

## 2. Context: AI ko change samajhne ki info kaise mili?

Imagine `checkout.js` calculation changes. Diff akela surrounding function nahi dikhata. Hum same commit ka source read karke changed area ke aas-paas lines select karte hain. JS/TS ke selected relative imports bhi try karte hain.

Optional docs search mein README/CONTRIBUTING ko overlapping pieces mein split kiya. PR title/description/file names se keyword matches rank karke relevant pieces select kiye. Original file/line coordinates retain kiye.

**Why:** whole repo bhejna noisy/expensive hota. Limited files/requests/text bhejte hain; skipped context disclose karte hain. Complete dependency graph nahi banaya.

**How I'd explain:** “I give the model the changed code, nearby code and selected related context, rather than asking it to guess from the diff alone.”

Code: `fetchReviewContext()` above; [prepareAiInput() / rankGuidance()](../server/src/features/ai/ai.context.js).

## 3. AI review: request se trustworthy output tak

Backend sanitized diff/context ko JSON text banata hai. `runAiAnalysis()` Gemini SDK se summary, impact aur evidence-linked findings maangta hai. JSON Schema expected fields/types describe karta hai. Response ke baad hamara code file, line aur quoted evidence match karta; invalid references reject hote hain.

**Why:** valid JSON aur correct evidence separate checks hain. Evidence match bhi reasoning correct hone ki guarantee nahi.

Code: [ai.service.js](../server/src/features/ai/ai.service.js)—`.rs` nahi.

### LangChain + TypeScript use kar sakte the?

**Haan—LangChain JavaScript mein bhi use hota hai.** Woh models/tools integrate karne ke common interfaces deta hai. TypeScript separate benefit deta: development-time type mistakes catch karna.

Current flow fixed hai: prepare → one model call → validate → save. Direct SDK keeps it easy to trace. Model ko tools choose karwane/multiple integrations ki need aaye toh LangChain useful option hai. Woh automatically better context ya provider uptime nahi deta. TypeScript ke baad bhi external AI output ki runtime validation chahiye.

References: [LangChain JS](https://docs.langchain.com/oss/javascript/langchain/overview), [TypeScript](https://www.typescriptlang.org/docs/handbook/intro.html).

## 4. Rules + saved history: AI fail ho toh?

[Rules](../server/src/features/analysis/analysis.rules.js) simple signals detect karte—e.g. auth-related code changed toh permissions inspect karo. [Analysis service](../server/src/features/analysis/analysis.service.js) rules/diffs/AI status assemble karke repository se save karata hai. MongoDB persistent; local memory restart pe lost. New revisions old reports replace nahi karti.

**Why:** AI failure ko “no bugs” nahi bolna; usable diff/rule report preserve karna.

## 5. Feedback memory: model ko yaad kaise rehta?

Automatically yaad nahi rehta. Hum Useful/Incorrect labels save karte hain. Next revision pe same PR/installation ka previous report query karke max three relevant useful hints prompt mein add karte hain. Finding ko current code se dobara validate karna padta—yeh model training nahi.

Code: [findPreviousAnalysis()](../server/src/features/analysis/analysis.repository.js) + `buildReviewMemory()` in ai.context.js.

## 6. Webhook: paste kiye bina review kaise starts?

GitHub PR event par `POST /api/webhooks/github` bhejta hai. [app.js](../server/src/app.js) original bytes preserve karta. [Webhook handler](../server/src/features/pullRequest/pullRequest.webhook.js) shared secret se signature calculate/compare karta; mismatch reject. Valid event ko 202 acknowledge karke same analysis service call karta hai.

**Why:** webhook second entry point hai, separate review engine nahi. Revision-based ID duplicate reviews rokta. 202 means accepted, completed nahi; crash ke baad redelivery needed.

**GitHub connect/comment:** [github.app.js](../server/src/features/pullRequest/github.app.js) callback verify karke session/repo access check karta. Optional summary flag par installation token se comment post karta. Live App onboarding/comment verification pending.

## 7. Langfuse tracing: exactly kahan wire ki?

`analysis.service.js` ka `measure()` GitHub/context/memory/model step ka start/end/status record karta. Report banne par `ai.service.js` ka `exportReviewTrace()` call hota hai.

Exporter parent review record aur linked step records (**spans**) banake Langfuse ke `/api/public/otel/v1/traces` par HTTP POST karta—only when enabled/credentials configured. Timing/model/token metadata jaata; raw code/prompts nahi. Two-second export failure review discard nahi karta.

**Why:** “request slow hai” ki jagah identify karo GitHub slow tha ya model. Local timings work; real Langfuse ingestion verification pending. Langfuse monitoring hai, LangChain model integration se separate.

## 8. Progress + database-free sample

Backend actual stage messages NDJSON—one JSON per line—stream karta. Client messages read karke spinner/status update karta; elapsed time completion promise nahi.

`App.jsx` URL ke according landing/app/history/report component choose karta. Request details mein provider token counts, timing aur serialized input size dikhate—missing tokens ko unknown rakhte hain.

`/demo` saved example hai: test code + actual recorded Gemini output JSON files se read/verify hote. `loadDemoReport()` ko DB/new AI call nahi chahiye. Normal persistent history MongoDB use karti; demo-only mode private/live operations disable karta hai.

## 9. MCP server: code kaise banaya?

Exact file: [server/scripts/mcp.js](../server/scripts/mcp.js).

`new McpServer()` se official SDK server banaya. `registerTool()` mein name, input rules aur handler diya. Example: client `read_report(id)` maange → handler scope check kare → existing repository se report read kare → JSON return kare.

SDK handshake/tool discovery handle karta. `StdioServerTransport` stdin/stdout se messages carry karta. Normal tools `list_reports`/`read_report` MongoDB use karte; demo-only `read_demo_report` existing sample loader call karta, no DB. Real stdio test passed; desktop setup pending.

**Why:** AI client ko standard report-access interface milta. MCP khud model nahi; every AI app compatible nahi. [Client setup](../README.md#local-read-only-mcp).

## 10. Evaluation + advanced work

[Evaluation script](../server/scripts/evaluate-ai.js) known test cases par output collect karta; Python scorer human judgments se quality measure kar sakta. Embedding experiment text ko number-vectors mein convert karke closest docs compare karta; persistent search index nahi.

**Pending/conditional:** Chroma = vectors store/search; LangGraph = saved checkpoints/branching/pause-resume; durable queue = crash ke baad jobs continue; remote MCP = hosted authenticated connector. Yeh implemented nahi. Hosting, human scoring aur browser QA bhi pending.

**Builder habit:** “Kaunsa data chahiye? Kahan se milega? Kaise verify karunga? Failure pe kya preserve hoga?” Framework uske baad choose karo.

Detailed status: [FEATURE_ROADMAP.md](FEATURE_ROADMAP.md). Live AI reliability unresolved: successful review aur separate provider504 dono observed hue.
