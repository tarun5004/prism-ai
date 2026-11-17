# PRism interactive storytelling plan

**Goal:** Integrate owner feedback into the accepted layout: richer visual storytelling, coordinated per-card colors, prominent integrations and an explorable request architecture. Keep the existing feature-based architecture, live behavior and local demo mode.
**Approach:** Native CSS depth/SVG diagrams plus a bounded decorative canvas cursor trail. No new runtime dependency or external service calls. Work in the existing owner-visible checkout; preserve all current WIP. No commit, push or deployment.

## Design rulings
- Replace the bottom mascot context strip and pause button with direct thought-card controls around Pip. Automatic float/blink/wave finish within five seconds; pointer/tap interactions trigger short transitions. Reduced motion disables decorative animation and cursor particles.
- Cursor cubes are local to the mascot scene, capped at 24 particles, short-lived, and stop scheduling frames when empty/unmounted. No document-wide cursor tracking or touch interception.
- Stable six-color semantic palette (coral, mint, yellow, sky, orange, lilac) is shared across features, onboarding, context and architecture. Hover/focus selects a coordinated accent; reading surfaces remain neutral.
- Feature cards explain what happens, a concrete example and what to inspect. Optional integrations are a visible section, not collapsed by default, with hosted limitations explicit.
- The four workspace cards use coordinated light frames and readable contained code previews; retained mouse/focus/touch behavior.
- Context explorer adds animated input/retrieval/checkpoint/output tiles tied to the selected stage; existing implementation details remain intact.
- Azure illustration follows an educational synthetic request: signed event -> Container Apps API -> Atlas durable job -> Azure Storage Queue -> Container Apps Job -> external Gemini -> validated saved report -> browser fetch. It is not live telemetry, not Azure Functions, and does not create a review. Mouse hover, keyboard, touch, previous/next and one-shot replay select checkpoints. Depth uses CSS with readable upright labels and a stacked small-screen fallback.

## Tasks and verification
- [x] 1. Add failing contracts for visible integrations, thought controls, per-step accents and a truthful synthetic architecture; observe RED.
- [x] 2. Implement bounded cursor cubes and short-lived mascot thoughts; remove old strip/pause and enforce reduced motion.
- [x] 3. Upgrade feature information/colors, workspace cards, onboarding and context visuals; preserve existing interaction contracts.
- [x] 4. Build an 8-checkpoint architecture with payload/provenance details and educational replay; verify queue before worker and persistence before enqueue.
- [x] 5. Run frontend tests/build; browser desktop/mobile/reduced-motion/keyboard/touch checks; fresh read-only review, fix issues, record evidence and leave localhost available.

## Failure/state contracts
- React state owns selected checkpoints/cards. Pointer coordinates only update decorative CSS variables/canvas; no API calls, secrets or providers.
- Timers, animation frames, media listeners and canvas observers are cleaned up. Replays stop at the final checkpoint and do not restart in a loop.
- Deferred integrations and optional semantic retrieval are not advertised as enabled. Backend and existing CI behavior stay unchanged.

## Verification evidence
- Two new frontend contracts failed before implementation, then passed. Frontend suite: 56 passed, zero skipped; Vite production build passed. No runtime dependencies added.
- Chromium: six distinct feature hover colors and four distinct onboarding selected colors measured after transitions settle. Thought keyboard selection, visible optional integrations, workspace expansion, context selection, queue payload and unavailable-provider example passed. Replay reached the final checkpoint and stopped.
- Cursor canvas painted on mouse movement and emptied after its short lifetime. Finite mascot animations settled after the introduction; reduced motion hid particles and disabled mascot/depth motion. Widths 320/390/768/1440 had no page overflow. No browser errors or POST requests during these presentation checks.
- Read-only review found no critical/important issue. Its palette consistency suggestion was applied to the context illustration tiles. Screenshots and browser scripts are ignored local artifacts under output/playwright/.
- Initial browser color checks sampled the first transition frame, and the finite-animation check restarted animations by toggling reduced motion. The checks now wait for the intended settled state and separately inspect finite iteration counts; no product failure was inferred from those timing errors.
- No new live model calls, OAuth authorization, CI run, commit, push or deployment. The existing demo-only API and localhost preview are retained for owner inspection.
- Separate Chromium mobile touch emulation passed thought/context/showcase/onboarding/architecture taps, emitted no cursor particles, and loaded the read-only recorded report. No page errors or POST requests. Final localhost homepage and API health checks returned HTTP 200.
