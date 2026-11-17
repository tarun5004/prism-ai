/**
 * Auto-review sirf tab chale jab:
 * - PR draft na ho
 * - Repository reviews paused na hon
 */
export function shouldAutoReview({ isDraft, reviewsPaused }) {
  return !isDraft || !reviewsPaused;
}
