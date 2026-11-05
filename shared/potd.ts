const BANDS = [1900, 1600, 1400, 1200, 0];
const BAND_LABELS: Record<number, string> = { 0: 'under 1200', 1200: '1200–1399', 1400: '1400–1599', 1600: '1600–1899', 1900: '1900+' };
const LOWEST_BAND_RATING = 1000;
const BAND_STEP = 200;

export const POTD_BANDS = [...BANDS].reverse();
export const potdBand = (rating: number | null) => BANDS.find((edge) => (rating ?? 0) >= edge)!;
export const potdRating = (band: number) => (band === 0 ? LOWEST_BAND_RATING : band + BAND_STEP);
export const potdBandLabel = (band: number) => BAND_LABELS[band];
export const potdBonus = (revealedBeforeSolve: boolean): 5 | 2 => (revealedBeforeSolve ? 2 : 5);
