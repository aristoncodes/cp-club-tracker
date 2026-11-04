export function ratingColor(rating: number): string {
  if (rating < 1200) return '#B4B4C2';
  if (rating < 1400) return '#4ADE80';
  if (rating < 1600) return '#22D3EE';
  if (rating < 1900) return '#60A5FA';
  if (rating < 2100) return '#C084FC';
  if (rating < 2400) return '#FBBF24';
  return '#F87171';
}
