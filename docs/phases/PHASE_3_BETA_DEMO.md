# Phase 3: Optional AI and Beta Demonstration

## Goal

Add structured AI reasoning only after the rule-based workflow is reliable, then prepare a repeatable beta demonstration.

## Build

- Add one replaceable AI provider interface.
- Send only the selected diff and context.
- Validate and normalize the AI response into the existing finding schema.
- Mark AI findings separately from rule findings.
- Fall back to a rule-only report when the provider fails.
- Prepare a small test set covering hidden impact, breaking change, test gap, and security concern.
- Record expected findings, observed findings, false positives, missed findings, and response time.

## Acceptance

- AI output cannot change the report shape or workflow state without validation.
- AI failure leaves a clear partial or failed result.
- A reviewer can trace every finding to evidence and source.
- The prepared demo can be repeated from a clean local setup.
- Results are described as observations, not unsupported accuracy claims.

## Deferred After Beta

- Webhooks and asynchronous workers
- Redis and cloud deployment
- AST-based analysis
- CI/CD gates
- Organization features and advanced history