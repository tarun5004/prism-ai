# PRism Beta v0 Requirements

## 1. Purpose

PRism Beta v0 converts one GitHub Pull Request into a small, evidence-first risk report for a human reviewer.

The beta is an academic prototype. It should prove the complete workflow with a small number of reliable features rather than attempt to become a full code-review platform.

## 2. User

The primary user is a developer or reviewer who wants to see which parts of a Pull Request deserve attention first.

## 3. Core Workflow

1. A user provides a GitHub Pull Request URL.
2. PRism retrieves the Pull Request metadata, changed files, and diff.
3. PRism selects small amounts of related JavaScript or TypeScript context.
4. Simple rules check the change for known risk signals.
5. An optional AI analysis explains possible impact using the selected evidence.
6. PRism stores and displays a structured report.
7. The reviewer inspects the evidence and makes the final decision.

## 4. Functional Requirements

### R1. Pull Request input

- Accept a GitHub Pull Request URL.
- Validate the URL and show a useful error for invalid input.
- Support one GitHub repository at a time for beta testing.

### R2. Pull Request data

- Retrieve title, repository, author, branch, status, changed-file names, and diff information.
- Keep the retrieved data attached to the analysis record.
- Show a clear error when GitHub access fails.

### R3. Analysis state

Each analysis must have one visible state:

- `queued`
- `processing`
- `completed`
- `failed`

The UI must never present a failed or incomplete analysis as a completed report.

### R4. Context selection

- Start with changed files and nearby imports or references that can be collected simply.
- Limit context to relevant snippets and file names.
- Do not copy or persist the whole repository.

### R5. Risk findings

Support these four categories only:

- Hidden impact
- Breaking change
- Test gap
- Security concern

Each finding must include:

- Category
- Severity: `low`, `medium`, or `high`
- Confidence: `low`, `medium`, or `high`
- Short explanation
- Evidence from the Pull Request or selected context
- Affected file names, when known
- Recommended reviewer action
- Source: `rule` or `ai`

### R6. Deterministic checks

Implement a small rule set for visible, testable signals such as:

- Changed exported or API-facing code
- Changed authentication or input-validation code
- Changed logic without a nearby test change
- Sensitive operations such as secrets, permissions, or database access

Rules should produce useful signals, not pretend to prove a defect.

### R7. AI analysis

- Treat repository content as untrusted input.
- Send only the selected diff and context needed for the report.
- Require a structured response matching the finding schema.
- Validate and normalize the response before storage.
- Allow the report to complete with rule findings if the AI provider is unavailable.

### R8. Review dashboard

The dashboard must show:

- Pull Request summary
- Overall risk summary
- Findings grouped or filtered by severity and category
- Evidence and affected files for each finding
- Analysis state and failure message, when applicable
- A list of previous analyses for the same Pull Request

### R9. Persistence

Store only the information needed to explain and retrieve the report:

- Pull Request identity and metadata
- Analysis state and timestamps
- Selected context references
- Normalized findings
- Failure information, when applicable

## 5. Non-Functional Requirements

- Secrets must come from environment configuration, never committed source code.
- GitHub access must use the least permission needed for the demo repository.
- The report must clearly distinguish evidence from AI reasoning.
- The workflow must be repeatable from a clean local setup.
- The main demo must work with a small prepared test repository and Pull Requests.

## 6. Explicitly Out of Scope for Beta v0

- GitHub Webhook automation
- Redis or a separate worker process
- AWS deployment
- Multiple repository providers
- Python, Java, or language-specific AST analysis
- Full dependency graphs or blast-radius visualizations
- Automatic merge blocking or CI/CD gates
- User roles, organization management, and production authentication
- Advanced analytics or comparison charts
- Storing complete repository snapshots
- Training or fine-tuning a custom model

These can be considered only after the core Pull Request-to-report workflow is stable.

## 7. Beta Acceptance Checklist

- A reviewer can submit a valid test Pull Request URL.
- The system retrieves and displays the Pull Request summary and changed files.
- An analysis produces at least one structured result or a clear no-findings result.
- Every finding has evidence, severity, category, and recommended action.
- The reviewer can tell whether a finding came from a rule or the AI layer.
- A GitHub or AI failure creates a visible failed or partial result.
- A previous analysis can be opened again.
- The demo can be repeated using documented test Pull Requests.