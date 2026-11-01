# PRism Beta UI Direction

## Direction

PRism uses a focused code-review workspace inspired by modern developer tools such as CodeRabbit:

- Light ivory page backgrounds and white panels keep attention on the report.
- Orange marks primary actions and selection; green marks completed states and added lines.
- Amber marks review attention and medium risk.
- Red is reserved for high risk and failures.
- The layout favors scanning: compact navigation, one clear submission action, and evidence beside findings.
- Lucide icons are used for controls and status cues.
- Motion is restrained to page entrance, loading feedback, and hover states.

## Beta Screens

1. `/`: submit a Pull Request and follow actual review progress.
2. `/analyses`: browse saved analyses and revisions.
3. `/analyses/:id`: inspect one saved report, diff and evidence-backed findings.

Native browser history keeps Back/Forward and direct report links usable without a routing dependency. SPA hosting must serve index.html for these page paths; Vite development and preview servers support this workflow.

The beta does not need a marketing landing page, a large chart system, or decorative illustrations.
