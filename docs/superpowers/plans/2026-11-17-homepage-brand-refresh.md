# PRism experience and structure implementation plan

**Goal:** Deliver an original Universe-inspired PRism homepage, a readable review workspace, and feature-based source organization; leave localhost available for owner review.
**Architecture:** React/Vite with native CSS/SVG interaction; existing Node/Express/Mongo contracts remain. Entry files delegate startup to bootstrap modules, which compose features without moving business logic into bootstrap.
**Tech stack:** Existing React 19, Vite, plain CSS, lucide-react, Express. No new runtime dependency.
**Design approval:** Owner approved plan plus execution on 17 November; requested original redesigned logo and all previously discussed content. Local acceptance precedes deployment. No new commits/pushes/deployment requested for this phase.

## Design and contracts
- Off-white editorial grid, oversized black typography, orange primary accent, violet/lime illustration accents. Dark review dashboard remains readable and receives consistent spacing, states and brand.
- Original geometric P/prism mark with code-bracket cues; no GitHub mascot or copied assets.
- `features/landing`: LandingPage composes hero, interactive prism, interactive evidence preview, capability catalogue, onboarding and architecture. Examples explicitly illustrative; no AI requests from visual interactions.
- `features/dashboard`: dashboard orchestration hook, focused page components, report status/feedback/reference components. Existing exports remain compatible while consumers move to the owning module.
- `shared`: BrandMark, RouteLink, EmailPreference. Local state belongs to its feature; no context/store framework introduced.
- `client/src/bootstrap.jsx`: React root mounting only. `server/src/bootstrap`: HTTP startup and worker startup only. Existing process entry paths remain stable.
- Preserve HMAC raw-body ordering, cookie/session checks, route navigation, in-flight review cancellation, exact-revision reports and read-only demo.
- Core features: bounded source/direct-import context, evidence at the line, summary/walkthrough, incremental revisions, feedback memory, saved reports.
- Optional semantic retrieval requires persistent Chroma; hosted demo does not enable this, opt-in GitHub delivery/controls, SMTP or tracing.
- Azure story: signed event -> API -> durable storage/queue -> event worker -> model -> saved report. Atlas/Gemini are external services. Min0 and 15-minute idle cooldown target are not billing guarantees.
- Cold recovery: GitHub does not automatically retry failed deliveries; warm workspace then Analyze PR or operator redelivery.

## Execution checklist
- [x] 1. Confirm RED content tests and preserve baseline regression tests.
- [x] 2. Extract shared UI, dashboard pages/report pieces/state hook and client/server bootstraps. Keep contracts and rerun regression checks.
- [x] 3. Build logo, light homepage, native keyboard-accessible preview, onboarding and architecture; pass content contracts.
- [x] 4. Run frontend/backend checks and production build; fresh whole-change review and fix significant issues.
- [x] 5. Verify real Chromium at desktop/mobile, navigation, keyboard, preview/architecture state and reduced motion. Leave local preview running; document mocked/local/live scope separately.

## Review focus
- Guest, authenticated, disabled and failed session states retain actionable controls.
- Finding click updates evidence highlight without a provider call.
- Mobile has no horizontal page overflow; code alone may scroll.
- Reduced motion disables tilt/animation; buttons work with keyboard and touch.
- Deep report routes and kept-mounted workspace preserve requests; bootstrap retains startup failure behavior.

## Ledger
- Existing uncommitted logo/content-test work belongs to this task and is preserved/replaced deliberately. Checkpoint source commits already exist.
- Ruling: work in the current owner-visible checkout, preserving prior WIP, so localhost and IDE show the same changes. No worktree migration or commits.
- Reference research: githubuniverse.com, linear.app, raycast.com, resend.com; official pages inspected, Universe owner screenshots and real Chromium Raycast/Linear screenshots reviewed. References guide composition, never capability claims.

## Owner follow-up: richer explanation and expressive motion
- Preserve the accepted layout and completed refactor. Add an original CSS 3D robot with idle float/blink/wave, pointer response and a keyboard/touch greeting control. Native CSS is sufficient for this mascot; no new WebGL dependency or copied GitHub character.
- Replace dominant violet surfaces with warm yellow, mint, coral and sky blue; keep neutral reading surfaces and an intentional, limited palette per section.
- Add navbar text roll and purposeful component motion, disabled for reduced motion. All functionality remains usable on touch.
- Add a concrete context/retrieval pipeline explorer, including sanitization, bounded inputs, optional Chroma chunk/index/retrieve and evidence validation; distinguish default hosted context from optional semantic retrieval.
- Add a GitLab/GitHub delivery explorer based on actual YAML. GitLab runs tests/build only when code is separately pushed there; no automatic repository sync or Azure deploy. GitHub manual deployment is gated by verify/integration/container and configured Azure identity. No claim of a current hosted green run.
- [x] 6. Add RED contracts for mascot, context internals and truthful CI separation; implement follow-up components and palette/motion.
- [x] 7. Recheck desktop/mobile, reduced motion, mascot state and new pipeline interactions; final build/tests and ledger.

## Completion evidence
- RED/GREEN: initial content contracts failed (five missing homepage capabilities/interactions), then passed. Follow-up mascot/context/CI contracts failed (three), then passed after implementation.
- Final frontend: 54 tests passed; backend bootstrap regression run: 172 passed, one optional integration skipped. Production client build passed. No new model calls were made for this design/refactor work.
- Real Chromium: public homepage, local recorded-sample API, keyboard finding selection, diff evidence highlighting, feature hover, onboarding/architecture controls, optional integration disclosure, mascot greeting/wave/pause/pointer state, navbar roll, context/CI explorers and reduced motion passed. Widths 320/390/768/1440 checked; source/evidence code may scroll inside its own region.
- Authenticated workspace/history/report browser flow passed using mocked session/history/report responses and the locally served recorded fixture. This is UI verification, not real GitHub OAuth or a fresh live AI review.
- Found report sidebar intrinsic grid overflow: 430px container/564px content before; explicit minmax(0,1fr) track gives 430px/430px after. Browser check now covers report sidebar widths.
- Fresh read-only whole-change review found no critical/important issues. Added polite detail announcements and made pause stop pointer-follow too. Fixed global workspace hover interference with homepage controls.
- GitLab JavaScript job now installs client dependencies before importing Vite/React frontend tests. Hosted GitLab execution remains dependent on runner/account verification; no hosted run or deployment was performed.
- Local API runs DEMO_ONLY=true on port 5000; existing Vite preview on 127.0.0.1:5178 stays available. No commits, pushes or deployments in this phase. Browser artifacts are ignored under output/playwright/.
