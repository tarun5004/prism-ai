# PRism AI — RULE.md

## 1. Project Objective

PRism AI V0 is a demo-ready AI-powered Pull Request Risk and Impact Analysis platform.

The objective is to build a functional application that helps developers understand code changes, inspect diffs, identify potential risks and review AI-generated findings with supporting evidence.

This is a focused academic and portfolio project, not an enterprise-scale SaaS platform.

Priorities:
- Working functionality
- Simple and maintainable architecture
- Reliable GitHub integration
- Evidence-based AI analysis
- Beginner-friendly code
- Professional UI/UX

## 2. Mandatory Repository Inspection

Before modifying code:

1. Inspect the existing project structure.
2. Read relevant source files and configuration.
3. Understand existing data flow and architecture.
4. Identify reusable services, components and utilities.
5. Check existing functionality and tests.
6. Identify the root cause of reported bugs.
7. Check Git status and protect uncommitted changes.

Never assume that a feature exists just because its UI is visible.

## 3. Code Modification Rules

- Fix bugs in existing files whenever reasonably possible.
- Never create a new file solely to avoid modifying an existing file.
- New files are allowed for genuinely new responsibilities.
- Reuse existing services, functions, hooks and components.
- Avoid duplicate logic.
- Avoid unnecessary refactoring.
- Do not rewrite working modules without a clear technical reason.
- Do not change the existing technology stack.
- Preserve existing functionality.

## 4. Architecture Rules

Follow the existing project architecture.

- Keep frontend and backend responsibilities separate.
- Keep business logic out of UI components.
- Keep API calls inside the existing service layer.
- Separate GitHub integration, context extraction, deterministic analysis, AI reasoning and report generation logically.
- Use existing validation and error-handling conventions.
- Avoid unnecessary abstractions, microservices and design patterns.
- Do not introduce new dependencies unless genuinely required.

## 5. Bug Fix Rules

For every bug:

1. Understand and reproduce the issue.
2. Identify the actual root cause.
3. Locate the responsible existing module.
4. Implement the smallest reliable fix.
5. Check related functionality.
6. Run relevant tests.
7. Report what was changed.

Never use a bug fix as an excuse for an unrelated refactor.

## 6. New Feature Rules

Before creating a new file:

- Search for existing functionality that can be extended.
- Reuse existing components and services where appropriate.
- Create a new file only when it represents a meaningful responsibility.
- Keep modules focused and easy to understand.

## 7. Code Quality

- Use descriptive variable and function names.
- Prefer small and readable functions.
- Avoid deeply nested conditions.
- Handle null, undefined and missing API fields.
- Use existing TypeScript types and interfaces.
- Add meaningful comments for non-obvious logic.
- Do not add comments to every obvious line.
- Remove unused imports and unnecessary debug logs.
- Never hardcode API keys or credentials.

## 8. AI Engineering Rules

- Analyze actual GitHub Pull Request data.
- Never fabricate code findings.
- Use relevant repository context when available.
- Provide evidence for important findings.
- Include valid file paths and line references whenever available.
- Distinguish deterministic rule findings from AI-generated findings.
- Validate model responses before saving them.
- Handle malformed responses, timeouts and API failures.
- Never claim that an AI review succeeded when the model request failed.
- Keep AI findings advisory, with human verification before merging.

## 9. GitHub and Diff Handling

- Handle GitHub API pagination.
- Handle renamed, deleted and added files.
- Handle unavailable patches explicitly.
- Preserve base and head commit SHAs.
- Preserve the analysis revision.
- Do not assume a patch is the complete file.
- Retrieve additional file content only when required.
- Handle binary and oversized files safely.
- Never silently replace unavailable content with an empty successful result.

## 10. Database Rules

- Follow existing database conventions.
- Preserve analysis history.
- Associate each analysis with its Pull Request revision.
- Avoid duplicate records from repeated events.
- Store only necessary repository information.
- Do not overwrite old reports when a new revision is analyzed.
- Keep database operations consistent with the existing architecture.

## 11. Frontend and UI Rules

- Preserve PRism's visual identity.
- Maintain consistent typography, spacing and colors.
- Use reusable UI components where appropriate.
- Keep the interface professional and developer-focused.
- Implement loading, empty, success and error states.
- Make changed-file navigation intuitive.
- Make diff and findings easy to inspect.
- Ensure responsive layouts.
- Avoid unnecessary animations and decorative elements.

## 12. Security Rules

- Keep secrets in environment variables.
- Never expose GitHub tokens or AI API keys in frontend code.
- Validate Pull Request URLs and external input.
- Validate GitHub Webhook signatures if Webhooks are used.
- Treat repository content as untrusted input.
- Protect against prompt injection in repository files.
- Limit permissions to what the prototype actually needs.

## 13. Git and Branch Management

Use these branches:

- feature/v0-backend
- feature/v0-frontend
- integration/v0-demo

Rules:

1. Never work directly on main.
2. Protect existing uncommitted changes.
3. Keep backend and frontend implementation separate.
4. Use small, meaningful commits.
5. Merge both feature branches into integration for testing.
6. Run the complete application on integration.
7. Fix issues in their respective feature branches.
8. Re-integrate and repeat testing.
9. Create a final Pull Request from the verified integration branch to main.
10. Never force-push or overwrite existing work without approval.

## 14. Testing Rules

After each meaningful implementation:

- Run relevant tests.
- Run lint and TypeScript checks where available.
- Verify API responses.
- Verify database persistence.
- Test missing and invalid data.
- Test failure and retry scenarios.
- Check existing functionality for regressions.
- Verify the complete user workflow.

Never report a successful test unless it was actually executed.

## 15. V0 Scope Restrictions

Do not introduce unnecessary enterprise infrastructure.

Avoid:
- Kubernetes
- Microservices
- Complex multi-tenant architecture
- Enterprise RBAC
- Distributed infrastructure
- Premature optimization
- Unnecessary caching layers
- Unnecessary dependencies
- Unrelated refactoring

Use the simplest reliable solution that fits the current project.

## 16. Implementation Workflow

For every task:

1. Inspect existing implementation.
2. Explain the problem.
3. Identify files to modify.
4. Identify any genuinely necessary new files.
5. Implement in small chunks.
6. Test the changes.
7. Review the code.
8. Commit to the correct branch.
9. Report actual outcomes and remaining issues.

Do not begin a large implementation without an approved plan.

## Final Principle

Build a working, understandable and demonstrable PRism AI V0.

Code clarity, functional correctness and trustworthy AI findings are more important than feature count.
## 17. Interview demo scope and autonomy (12 November 2026)

The product goal is an interviewer opening a live link and understanding a small, working AI review demo. Optimize for explainable fundamentals, reliable visible behavior and short readable code, not production scale or framework count.

- Reuse existing modules first. Do not create a file to work around an existing bug. New files require a genuinely separate responsibility.
- Demonstrate retrieval, grounding, evaluation, observability and scoped revision memory with the existing Gemini/MongoDB stack. LangChain, LangGraph and a vector database are optional only when they remove a concrete problem; a keyword alone is not a reason.
- Keep an honest, read-only public sample available without GitHub authorization; private live reports remain protected. Clearly label captured sample data and its scope.
- User-approved implementation can proceed through the documented chunks without repeated approval requests. Account setup, paid services, destructive actions and merging main still need explicit authorization when not already granted.
- Inspect the responsible path, implement one small change, run the relevant check, review and commit before the next chunk. Use an existing ledger for decisions and failed checks; do not generate planning documents for every small change.
- Add short comments at non-obvious feature/function boundaries explaining purpose and where failures are handled. Avoid comments that merely restate each line.
- Provider calls are authorized when useful. No automatic generation retries or unbounded batches. Keep offline checks separate from live-provider evidence.
- Export only allowlisted operational metadata to optional tracing services. Repository code, feedback reasons, access tokens and secrets stay out of external traces by default.
- Preserve existing user changes, update feature status honestly, and stop feature expansion when the agreed demo slices and meaningful checks are complete.
