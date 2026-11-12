/**
 * The only place that words a position error (spec 01 requirement 20.3 and 20.4).
 *
 * The figure is a conservative estimate, not a bound. The text never says "±", "exactly" or
 * "guaranteed". Stored errors are multiples of 0.1 m, so one decimal shows them as stored; a
 * value that is not a multiple is rounded up to the next 0.1 m so the text never understates it.
 */
export function positionPhrase(positionErrorM: number): string {
  if (!Number.isFinite(positionErrorM) || positionErrorM <= 0) {
    throw new RangeError(`position error must be a positive number of metres, got ${positionErrorM}`);
  }
  // toFixed(9) absorbs float noise (4.5 stored as 4.500000000000001) before rounding up.
  const rounded = Math.ceil(Number((positionErrorM * 10).toFixed(9))) / 10;
  return `Positioned within about ${rounded.toFixed(1)} m`;
}
