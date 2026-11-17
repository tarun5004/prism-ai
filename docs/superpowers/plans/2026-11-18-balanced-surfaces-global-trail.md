# Balanced surfaces and homepage cursor trail

> **Superseded design draft.** Do not execute the palette tasks below. The owner chose the original homepage palette, followed by a 20% non-yellow lightness adjustment (`6d026ae`). The global trail shipped in `a019659`. These unchecked tasks describe the abandoned proposal, not remaining release work. Workspace colors are covered by `2026-11-18-workspace-visual-continuity.md`.

**Goal:** Restore the accepted mint/sage depth, remove the disliked mustard/large solid fills, and extend the cube trail to the full homepage.
**Approach:** Existing React/CSS/canvas only. Execute inline in the owner-visible checkout; preserve unrelated WIP and existing accepted layout. No commit, push, deployment, provider call or dependency change.

## Research and design rulings
- Radix separates background steps 1–2, component states 3–5, borders 6–8 and solid accents 9–10: https://www.radix-ui.com/colors/docs/palette-composition/understanding-the-scale
- Atlassian separates neutral surfaces, accent emphasis, selection and focus; selection also needs a border/shape cue: https://atlassian.design/foundations/color/
- Palette reference: official Radix light scales, https://github.com/radix-ui/colors/blob/main/src/light.ts . Use green/mint/sage state values and coordinated crimson/sky/orange/violet accents. Strong fills stay on small chips, icons and graphic stripes; no giant mustard/purple/pink surfaces. No invented universal opacity or 60/30/10 requirement.
- Restore the mint framing behind workspace cards and the context/Azure canvas, with visible borders, small offset shadows and distinct tinted hover/selected states. Reading panes remain calm. Replace yellow/mustard in the active palette with a supporting teal accent while retaining the internal `yellow` token name for compatibility.

## Modules and state
- `interaction-palette.css`: canonical accent, tinted-state and text values, plus mint canvas/surface/border/shadow tokens. Section CSS consumes those roles.
- `LandingPage.jsx`: owns the single CursorCubes instance for the homepage. Remove the hero instance.
- `CursorCubes.jsx`, dedicated cursor CSS: a fixed viewport-sized canvas listens only to the landing root. Uses viewport coordinates so scrolling cannot create a full-document bitmap or coordinate drift. Cap DPR at 2, particles at 24 and lifetime at 650ms. Ignore touch and reduced motion; do not intercept links, selection, controls or scrolling. Clear on scroll, pointer leave, blur, tab hidden, resize and reduced-motion changes; cancel RAF/listeners on unmount. No state updates per pointer event.

## Tasks
- [ ] Add a failing ownership contract for exactly one homepage-scoped trail, located outside the hero.
- [ ] Apply referenced surface/state palette and restore card framing/depth. Inspect default and hover/selected screenshots.
- [ ] Move/refactor the bounded trail; verify nav, content, footer, scroll position and route unmount behavior.
- [ ] Run frontend suite/build and Chromium checks: viewport bitmap dimensions, pixel paint/expiry across sections, click-through, touch, reduced motion, no route leakage, no page overflow and no model/write requests. Inspect rendered text contrast and record results in FEATURE_ROADMAP.

## Limitations
- The color density choice is a design judgment based on semantic scale roles, not a measured optimal percentage.
- One fixed canvas is limited to the viewport; no WebGL or animation dependency. Static screenshots do not prove motion; pixel/lifecycle checks complement visual review.
