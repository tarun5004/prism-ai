# PRism Beta v0 Plan

## Product Decision

Beta v0 is a review-support dashboard, not an autonomous code reviewer. The smallest useful product is a manual Pull Request submission that returns a traceable risk report.

The source synopsis describes a larger architecture with webhooks, queues, MongoDB, Redis, and cloud deployment. Those ideas remain future options. They are not required to prove the central value of PRism.

## Beta Goal

Demonstrate this path reliably:

`Pull Request URL -> metadata and diff -> small repository context -> rules and optional AI -> evidence-backed report`

## Proposed Shape

- One frontend dashboard
- One backend API
- One analysis runner called by the API
- One persistence adapter
- GitHub REST API as the only external integration
- Optional LLM provider behind a small interface

Avoid separate services until the single-process workflow is proven.

## Recommended Build Order

1. Define the report schema and local sample data.
2. Build the dashboard against the sample data.
3. Add Pull Request retrieval and persistence.
4. Add deterministic rules.
5. Add optional structured AI reasoning.
6. Test the complete workflow with prepared Pull Requests.

This order keeps the demo usable even while external integrations are incomplete.

## Success Measure

For a prepared test Pull Request, a reviewer can identify the highest-priority review areas, open the supporting evidence, and understand why the system raised each finding faster than by looking at the raw diff alone.

## Main Risks and Responses

| Risk | Small response |
| --- | --- |
| GitHub credentials or rate limits block the demo | Keep local sample data and a mock adapter for development |
| AI output is inconsistent | Validate a strict schema and allow rule-only completion |
| Context selection becomes too large | Limit files and snippets explicitly |
| Too many features delay the demo | Use the out-of-scope list as a stop rule |
| Findings are hard to trust | Show evidence and finding source for every result |

## Deliverables

- Working local beta workflow
- Requirements documented in `PRISM_BETA_V0_REQUIREMENTS.md`
- One phase document per delivery slice
- Small prepared test set with expected findings
- Short demo and evaluation notes

## Definition of Done

The beta is done when the acceptance checklist in the requirements document passes for the prepared test Pull Requests and the workflow can be demonstrated from a clean local setup.