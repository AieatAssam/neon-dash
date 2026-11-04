/** Stable world-space tiles for scrolling background layers.
 *
 * Each tile's appearance is derived from its absolute index, so a feature does
 * not change shape when it crosses a viewport boundary. Keep rendering pure:
 * compute these from simulation distance, never accumulated frame deltas.
 */
export type ScrollingTile = { index: number; x: number; seed: number };

/** Crossfade between schemes near each boundary, with fixed endpoints. */
export function blendHex(a: string, b: string, t: number): string {
  const amount = Math.max(0, Math.min(1, t));
  return '#' + [1, 3, 5].map(i => Math.round(parseInt(a.slice(i, i + 2), 16) * (1 - amount) + parseInt(b.slice(i, i + 2), 16) * amount).toString(16).padStart(2, '0')).join('');
}

function hashIndex(index: number): number {
  // Integer avalanche hash; stable across browsers and independent of frame rate.
  let value = index | 0;
  value = Math.imul(value ^ (value >>> 16), 0x7feb352d);
  value = Math.imul(value ^ (value >>> 15), 0x846ca68b);
  value = (value ^ (value >>> 16)) >>> 0;
  return value / 0x100000000;
}

/** Return all tiles intersecting the viewport plus optional edge padding. */
export function scrollingTiles(
  distance: number,
  viewportWidth: number,
  spacing: number,
  parallax: number,
  overscan = 1,
): ScrollingTile[] {
  if (![distance, viewportWidth, spacing, parallax, overscan].every(Number.isFinite) || spacing <= 0 || viewportWidth < 0 || overscan < 0) {
    throw new RangeError('Invalid scrolling background dimensions');
  }
  const offset = distance * parallax;
  const first = Math.floor(offset / spacing) - overscan;
  const last = Math.ceil((offset + viewportWidth) / spacing) + overscan;
  const result: ScrollingTile[] = [];
  for (let index = first; index <= last; index++) {
    result.push({ index, x: index * spacing - offset, seed: hashIndex(index) });
  }
  return result;
}
