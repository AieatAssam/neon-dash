/** A small, deterministic vertical runner section. Coordinates use x across
 * the corridor and y down the course. The active color attracts the runner
 * toward its matching wall; switching color changes the target wall. */

export type VerticalPhase = 0 | 1;

export interface VerticalObstacle {
  /** Top-left corner in section coordinates, matching collision bounds. */
  x: number;
  y: number;
  width: number;
  height: number;
  /** Decorative gates and arrows — never collide. */
  passive?: boolean;
}

export interface VerticalSectionConfig {
  width: number;
  height: number;
  wallInset?: number;
  playerRadius?: number;
  attraction?: number;
  lateralDamping?: number;
  forwardSpeed?: number;
  /** Override the simulation tick when embedded in a host fixed-step loop. */
  fixedStep?: number;
  obstacles?: readonly VerticalObstacle[];
}

export interface VerticalSectionState {
  x: number;
  y: number;
  vx: number;
  phase: VerticalPhase;
  crashed: boolean;
  ticks: number;
}

export interface VerticalSectionInput {
  /** Set true for one tick to switch color. */
  switchPressed?: boolean;
}

export const VERTICAL_SECTION_DT = 1 / 120;

/** Readable course layout: alternate a blocked side and a safe side, with a
 * clear center transition zone so every obstacle has a viable color route. */
export const VERTICAL_FIRST_LETHAL_Y = 850;
/** Minimum travel after entry before the first blocking gate. */
export const VERTICAL_SAFE_RUNWAY_Y = 720;

export const VERTICAL_SECTION_OBSTACLES: readonly VerticalObstacle[] = Object.freeze([
  Object.freeze({ x: 95, y: 480, width: 230, height: 36, passive: true }),
  Object.freeze({ x: 190, y: VERTICAL_FIRST_LETHAL_Y, width: 230, height: 46 }),
  Object.freeze({ x: 0, y: 1330, width: 220, height: 46 }),
  Object.freeze({ x: 190, y: 1780, width: 230, height: 46 }),
  Object.freeze({ x: 0, y: 2280, width: 220, height: 46 }),
]);

/** Seeded, repeatable course variation. Each gate independently chooses a
 * blocked side, so routes can repeat a safe wall or ask for a color change. */
export function createVerticalSectionCourse(seed: number, count = 5): readonly VerticalObstacle[] {
  let value = seed >>> 0;
  const next = () => {
    value = (value * 1664525 + 1013904223) >>> 0;
    return value / 0x100000000;
  };
  const obstacles: VerticalObstacle[] = [
    { x: 95, y: 500, width: 230, height: 38, passive: true },
  ];
  let gateY = VERTICAL_FIRST_LETHAL_Y;
  for (let i = 0; i < count; i++) {
    const blockedLeft = next() < 0.5;
    const height = 40 + Math.floor(next() * 12);
    const spacing = i < 2 ? 460 + Math.floor(next() * 40) : 560 + Math.floor(next() * 80);
    obstacles.push({
      x: blockedLeft ? 0 : 190,
      y: gateY,
      width: 230,
      height,
    });
    gateY += height + spacing;
  }
  return Object.freeze(obstacles.map(obstacle => Object.freeze(obstacle)));
}

export function createVerticalSection(config: VerticalSectionConfig): VerticalSectionState {
  return {
    x: config.width / 2,
    y: 0,
    vx: 0,
    phase: 0,
    crashed: false,
    ticks: 0,
  };
}

/** Advance exactly one fixed simulation tick. Repeated calls with the same
 * inputs and initial state produce bit-for-bit identical states. */
export function stepVerticalSection(
  state: VerticalSectionState,
  input: VerticalSectionInput,
  config: VerticalSectionConfig,
): VerticalSectionState {
  if (state.crashed) return { ...state };

  const dt = config.fixedStep ?? VERTICAL_SECTION_DT;
  const radius = config.playerRadius ?? 12;
  const inset = config.wallInset ?? 30;
  const acceleration = config.attraction ?? 1500;
  const damping = config.lateralDamping ?? 8;
  const speed = config.forwardSpeed ?? 240;
  const phase = input.switchPressed ? (state.phase === 0 ? 1 : 0) : state.phase;
  const newTargetX = phase === 0 ? inset : config.width - inset;
  // A bounded spring avoids the large position-proportional impulses that
  // make the player oscillate across the corridor at fixed-step rates.
  const spring = Math.max(-acceleration, Math.min(acceleration, (newTargetX - state.x) * 18));
  const vx = state.vx + (spring - state.vx * damping) * dt;
  const minX = radius;
  const maxX = config.width - radius;
  const x = Math.max(minX, Math.min(maxX, state.x + vx * dt));
  const y = state.y + speed * dt;
  const obstacles = config.obstacles ?? [];
  const crashed = obstacles.some(obstacle =>
    !obstacle.passive &&
    x + radius > obstacle.x && x - radius < obstacle.x + obstacle.width &&
    y + radius > obstacle.y && y - radius < obstacle.y + obstacle.height,
  );
  return { x, y, vx, phase, crashed, ticks: state.ticks + 1 };
}
