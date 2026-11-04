export function ratingColor(rating: number): string {
  if (rating < 1200) return '#9CA3AF';
  if (rating < 1400) return '#22C55E';
  if (rating < 1600) return '#06B6D4';
  if (rating < 1900) return '#3B82F6';
  if (rating < 2100) return '#A855F7';
  if (rating < 2400) return '#F59E0B';
  return '#EF4444';
}
