# Phase 2: Pull Request Retrieval and Simple Analysis

## Goal

Replace sample input with one real GitHub Pull Request path and produce deterministic findings.

## Build

- Accept and validate a GitHub Pull Request URL.
- Retrieve Pull Request metadata, changed files, and diff through a small GitHub client.
- Store an analysis record and its status.
- Select limited JavaScript or TypeScript context from changed files and simple imports.
- Implement the four small deterministic risk checks from the requirements.
- Display the real report in the existing dashboard.

## Acceptance

- A prepared test Pull Request can be submitted without manually pasting its diff.
- GitHub failures show a useful failed state.
- The report contains rule findings or an explicit no-findings result.
- No complete repository snapshot is stored.
- The same analysis can be opened again from history.

## Do Not Add Yet

- Webhook-triggered analysis
- Background workers or queues
- Multi-language parsing
- Dependency graph generation