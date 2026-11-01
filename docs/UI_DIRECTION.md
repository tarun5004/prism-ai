# PRism Beta UI Direction

## Direction

PRism uses a focused code-review workspace inspired by modern developer tools such as CodeRabbit:

- Charcoal backgrounds and slightly lighter mauve-neutral panels keep attention on the report.
- Orange marks primary actions and selection; green marks completed states and added lines.
- Amber marks review attention and medium risk.
- Red is reserved for high risk and failures.
- The layout favors scanning: compact navigation, one clear submission action, and evidence beside findings.
- Lucide icons are used for controls and status cues.
- Motion is restrained to page entrance, loading feedback, and hover states.

## Beta Screens

1. `/`: introduction, interactive illustrative feature preview, context workflow and trial entry.
2. `/app`: submit a Pull Request and follow actual review progress.
3. `/analyses`: browse saved analyses and revisions.
4. `/analyses/:id`: inspect one saved report, diff and evidence-backed findings.

Native browser history keeps Back/Forward and direct report links usable without a routing dependency. SPA hosting must serve index.html for these page paths; Vite development and preview servers support this workflow.

The introduction follows the approved dark reference: sticky navigation, split hero, expanding feature selectors, product preview beside benefit descriptions, context-step selector and an oversized orange-outline footer wordmark with a bottom fade. All trial links open `/app`. Illustrative code is labelled and never presented as an actual saved review. No customer logos, fabricated metrics or unimplemented integration claims.

Use fluid text and bounded content widths at normal browser zoom; the reference screenshots were taken at 60–70% zoom and are composition references, not pixel measurements. On narrow screens, stack hero/feature columns, use two-column feature controls, collapse decorative preview navigation and wrap footer content. Keep Inter and JetBrains Mono locally hosted. Respect reduced-motion preferences. No new packages are required.
