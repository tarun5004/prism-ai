# Workspace visual continuity implementation plan

## Final approved direction

Use GitHub.com's actual Dark default theme for new review, analyses, report/context/findings panels, connection controls, code diffs and evidence. This supersedes the light/mint and Universe workspace proposals. Preserve the approved homepage and the existing React feature boundaries.

## Architecture and contracts

- `shared/palette.css`: shared homepage brand declarations, preserving their exact values.
- `App.jsx`: `.workspace-theme` boundary around non-landing routes, preserving the existing mounted/hidden dashboard and its review state.
- `features/dashboard/workspace.css` and `styles/workspace-*.css`: foundation, navigation, reports, code and responsive presentation, scoped to the workspace.
- `WorkspaceCapabilities.jsx`: static new-review guidance; no state or network requests.
- Existing submission, polling, auth, filters, feedback and evidence navigation remain owned by their original modules. No dependencies or backend changes.

## Color reference

Official GitHub Dark default stylesheet fetched on 2026-11-18:
https://github.githubassets.com/assets/dark-534def0b30583f22.css

Mapped canvas, surfaces, text, borders, links, primary buttons, selection indicator and semantic/diff states. Removed decorative rainbow borders. Code text and line fills follow the official diff roles. Homepage palette remains unchanged.

## Completed tasks

- [x] Extract shared brand tokens and apply the workspace theme boundary.
- [x] Style navigation, submission/history and connection states.
- [x] Style report summaries, findings/context and code/evidence surfaces.
- [x] Verify frontend behavior checks, build, rendered contrast and local browser flows.
- [x] Obtain owner authorization to commit/push the reviewed source changes.

## Verification

- Frontend: 61 existing tests pass; production build passes. Freshly repeated before committing.
- Automated comparison: 17 principal workspace palette tokens match the referenced live stylesheet.
- Browser: real local recorded sample; private views use mocked session/history/report data. No GitHub/model writes.
- Browser widths: 320/390/768/1440 without document overflow. Findings filters, evidence jump, history empty/error/reload and unavailable AI states pass.
- Sampled rendered text/control contrast minimum: 4.63:1.
- Independent source review found no critical/important introduced defect; final palette-only follow-up was checked through the browser and source token comparison. Memory-source links were styled to avoid low-contrast browser defaults.
- Source changes grouped into separate theme, new-review guidance and documentation commits. Push is authorized; Azure deployment is outside this publication step.
