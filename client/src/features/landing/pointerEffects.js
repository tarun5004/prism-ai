// Decorative coordinates stay out of React state, so moving the pointer does not rerender cards.
export function moveSpotlight(event) {
  if (event.pointerType !== 'mouse' || window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;
  const bounds = event.currentTarget.getBoundingClientRect();
  event.currentTarget.style.setProperty('--pointer-x', `${event.clientX - bounds.left}px`);
  event.currentTarget.style.setProperty('--pointer-y', `${event.clientY - bounds.top}px`);
}
