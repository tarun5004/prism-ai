/**
 * Auto-review sirf tab chale jab:
 * - PR draft na ho
 * - Repository reviews paused na hon
 */
export function shouldAutoReview({ isDraft, reviewsPaused }) {
  return isDraft && !reviewsPaused;
}

// Hosted review smoke test: Gemini Flash-Lite deployment.
// Hosted review smoke test: Malaysia West worker.
// Bounded Python agent rollout smoke: 2026-11-18T13:52:28.097Z.
// Bounded Python agent rollout smoke: 2026-11-18T14:01:39.665Z.
