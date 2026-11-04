import type { Terrain } from './core';

/** A continuous void with two stepping stones. The entry runway is on solid
 * ground; both inner platforms are necessary to cross the 698-unit void.
 * Coordinates are offsets from the phrase origin. */
export const LONG_GAP_CROSSING = Object.freeze([
  Object.freeze({ kind: 'platform' as const, x: 132, width: 200, height: 18 }),
  Object.freeze({ kind: 'gap' as const, x: 332, width: 698, height: 0 }),
  Object.freeze({ kind: 'platform' as const, x: 460, width: 170, height: 28 }),
  Object.freeze({ kind: 'platform' as const, x: 760, width: 170, height: 18 }),
]) satisfies readonly Terrain[];

export function longGapCrossingAt(x: number): Terrain[] {
  return LONG_GAP_CROSSING.map(feature => ({ ...feature, x: feature.x + x }));
}

/** Analytic jump arc from a platform top, used for candidate geometry checks. */
export function jumpHeightAt(horizontalDistance: number, speed: number, gravity = 1800, jumpVelocity = -620): number {
  const t = horizontalDistance / speed;
  return jumpVelocity * t + gravity * t * t / 2;
}
