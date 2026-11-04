import type { Collectible, Terrain } from './core';

/** Three readable layouts for a continuous long void. Each retains two inner
 * stepping stones, but changes their spacing and landing height. Coordinates
 * are offsets from the phrase origin. */
export const LONG_GAP_CROSSINGS = Object.freeze([
  Object.freeze([
    Object.freeze({ kind: 'platform' as const, x: 132, width: 200, height: 18 }),
    Object.freeze({ kind: 'gap' as const, x: 332, width: 698, height: 0 }),
    Object.freeze({ kind: 'platform' as const, x: 460, width: 170, height: 28 }),
    Object.freeze({ kind: 'platform' as const, x: 760, width: 170, height: 18 }),
  ]),
  Object.freeze([
    Object.freeze({ kind: 'platform' as const, x: 132, width: 200, height: 18 }),
    Object.freeze({ kind: 'gap' as const, x: 332, width: 620, height: 0 }),
    Object.freeze({ kind: 'platform' as const, x: 432, width: 158, height: 18 }),
    Object.freeze({ kind: 'platform' as const, x: 700, width: 160, height: 28 }),
  ]),
  Object.freeze([
    Object.freeze({ kind: 'platform' as const, x: 132, width: 200, height: 18 }),
    Object.freeze({ kind: 'gap' as const, x: 332, width: 720, height: 0 }),
    Object.freeze({ kind: 'platform' as const, x: 450, width: 240, height: 28 }),
    Object.freeze({ kind: 'platform' as const, x: 810, width: 160, height: 18 }),
  ]),
]) satisfies readonly (readonly Terrain[])[];

/** Backward-compatible canonical layout. */
export const LONG_GAP_CROSSING = LONG_GAP_CROSSINGS[0];

export function longGapCrossingAt(x: number, variant = 0): Terrain[] {
  const layout = LONG_GAP_CROSSINGS[((Math.trunc(variant) % LONG_GAP_CROSSINGS.length) + LONG_GAP_CROSSINGS.length) % LONG_GAP_CROSSINGS.length];
  return layout.map(feature => ({ ...feature, x: feature.x + x }));
}

/** Three optional rewards sit near the apex of the entry and stepping-stone
 * jumps. The caller appends these to the normal collectible stream. */
export function longGapCollectiblesAt(x: number, groundY = 300, variant = 0): Collectible[] {
  const platforms = LONG_GAP_CROSSINGS[((Math.trunc(variant) % LONG_GAP_CROSSINGS.length) + LONG_GAP_CROSSINGS.length) % LONG_GAP_CROSSINGS.length]
    .filter(feature => feature.kind === 'platform');
  const gap = LONG_GAP_CROSSINGS[((Math.trunc(variant) % LONG_GAP_CROSSINGS.length) + LONG_GAP_CROSSINGS.length) % LONG_GAP_CROSSINGS.length]
    .find(feature => feature.kind === 'gap')!;
  return [gap.x - 40 + 100, platforms[1].x + platforms[1].width - 40 + 100,
    platforms[2].x + platforms[2].width - 40 + 100]
    .map(offset => ({ x: x + offset, y: groundY - 120, radius: 10 }));
}

/** Analytic jump arc from a platform top, used for candidate geometry checks. */
export function jumpHeightAt(horizontalDistance: number, speed: number, gravity = 1800, jumpVelocity = -620): number {
  const t = horizontalDistance / speed;
  return jumpVelocity * t + gravity * t * t / 2;
}
