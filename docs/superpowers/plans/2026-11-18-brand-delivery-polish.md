# Brand and delivery polish implementation plan

> Execute inline with executing-plans. Owner requested plan and execute, with visual approval on localhost afterwards. Preserve the existing working tree; no commit, push or deployment.

**Goal:** Replace the letter P with an original Pip character identity, make the lower homepage as interactive as the hero, and unify color behavior.
**Architecture:** Keep SVG assets, existing React feature modules and scoped CSS. Delivery state is local `{provider, selectedStage}`; switching provider resets the stage. Footer state selects one of three product perspectives. No timers, network calls or runtime dependencies are required.
**Design choice:** A simple Pip robot face is recognizable at favicon size and ties into the existing mascot. An abstract prism would retain the rejected letter-mark feel; a detailed raster mascot would lose clarity at small sizes. Use an original antenna/visor silhouette, not GitHub's cat character.

## Responsibilities and contracts
- `client/public/prism-mark.svg`: original compact Pip mark reused by the existing shared BrandMark, favicon and Pip chest badge.
- `deliveryWorkflows.js`: accurate configured workflow stages and their artifacts/checkpoints. No assertion of hosted execution.
- `DeliveryPipeline.jsx`, `DeliveryStageExplorer.jsx`, `styles/delivery-pipeline.css`: provider and stage controls, keyed explanation, local trace rail, distinct coordinated accents; hover/focus/tap select a stage. Keep all manual gate and separate-push disclosures.
- `LandingFooter.jsx`, `styles/footer.css`: extract final CTA/footer from LandingPage; three perspective buttons update copy and a geometric beam/mascot panel. Existing navigation destinations stay intact. Decorative, aria-hidden footer letters react locally on hover without adding keyboard stops; actionable links and perspective controls support focus/touch. No continuous animation.
- `styles/interaction-palette.css`: one canonical accent/soft/ink triple per color. Remove duplicate triples from engineering.css; use these tokens in lower sections and hero. Neutral reading surfaces, charcoal text, six accents with stable roles; replace the isolated neon-lime footer with palette colors.

## Tasks
- [x] Add contracts for exposed workflow stage/footer controls; observe failures before implementation. Exercise selection/reset/copy/link behavior in real Chromium.
- [x] Draw and inspect the original Pip SVG at favicon and navbar sizes.
- [x] Build CI stage explorer with explicit artifacts, input/output and gate details; keep local illustrative labels.
- [x] Extract and implement interactive final CTA/footer; consolidate palette definitions and harmonize hero/section accents.
- [x] Run frontend tests/build and browser desktop/mobile/touch/keyboard/reduced-motion checks. Inspect screenshots, no-overflow widths 320/390/768/1440, actual computed colors and error/network logs. Review and record evidence in FEATURE_ROADMAP.

## Failure and verification boundaries
- Hover has equivalent native-button keyboard/touch controls. Decoration cannot block pointer events; reduced motion suppresses transitions.
- Provider switching always selects stage zero; CI illustration never starts a workflow or AI call. No fake passing statuses or automatic GitHub-to-GitLab sync.
- Footer perspective changes preserve links and connection state. No worktree relocation because the owner is reviewing this exact localhost checkout with existing WIP.
- Visual verification covers local UI. Actual CI, OAuth, live inference and Azure deployment remain outside this change.

## Verification and rulings
- Two new initial-render contracts failed before implementation; final frontend suite **59 passed**. Browser checks separately exercise state transitions; SSR tests alone do not prove interaction behavior.
- Browser contrast checks exposed insufficient ink contrast on blue, orange and lilac active surfaces. Darkened those three inks and added a regression test: failed on original values, passed on corrected values. All six ink/active and ink/soft pairs now exceed 4.5:1 (lowest 4.52:1).
- Production build passed; no dependencies added. Real Chromium passed all four stage selections/colors, provider switch reset, manual gate details, three closing perspective states/colors/links, mobile touch, reduced-motion behavior, no page overflow at 320/390/768/1440, and zero page errors/POST requests. Inspected desktop/mobile screenshots and original logo at 16/32/96px on light/dark surfaces.
- Fresh read-only review found no critical/important blocker. Corrected its artifact copy finding: failed GitLab jobs can still retain logs/JUnit reports. Clarified that decorative wordmark letters intentionally do not add keyboard stops. Keyboard users have native links and perspective/stage buttons.
- During the red/green CSS regression check, transient file truncation left Vite's imported stylesheet cache stale. Restarted only the verified localhost Vite process on port 5178 and reran browser checks; production build was unaffected. Final homepage and API health returned 200. Existing owner-visible preview stays at http://127.0.0.1:5178/.
- No commit, push, deployment, paid provider call or actual CI run performed.
