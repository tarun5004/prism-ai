// Demo: average should be total divided by item count.
export function calculateAverage(numbers) {
  const total = numbers.reduce((sum, value) => sum + value, 0);
  return total;
}
