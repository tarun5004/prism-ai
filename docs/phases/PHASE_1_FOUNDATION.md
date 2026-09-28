# Phase 1: Foundation and Report Shape

## Goal

Create the smallest runnable shell and agree on the data contract before connecting external services.

## Build

- Create the basic frontend and backend structure.
- Define the analysis, finding, and Pull Request schemas.
- Add local sample analyses, including completed, failed, and no-findings states.
- Build the first dashboard view from sample data.
- Add basic environment configuration without real secrets.

## Acceptance

- The dashboard renders a sample report.
- A finding shows category, severity, confidence, evidence, affected files, action, and source.
- The UI visibly handles processing, completed, failed, and no-findings states.
- The schema can be used without an AI provider or GitHub token.

## Do Not Add Yet

- Webhooks
- Redis
- Authentication
- Cloud deployment
- Advanced charts