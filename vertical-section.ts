/** A small, deterministic vertical runner section. Coordinates use x across
 * the shaft and y down the course. The active color attracts the runner
 * toward its matching wall; switching color changes the target wall. */

export type VerticalPhase = 0 | 1;

export interface VerticalObstacle {
  /** Top-left corner in section coordinates, matching collision bounds. */
  x: number;
  y: number;
  width: number;
  height: number;
  /** Decorative markers never collide. */
  passive?: boolean;
}

export interface VerticalOrb { x: number; y: number; radius: number; shield?: boolean }

export interface VerticalSectionConfig {
  width: number;
  height: number;
  wallInset?: number;
  playerRadius?: number;
  /** Angular frequency of the critically damped wall spring. */
  stiffness?: number;
  forwardSpeed?: number;
  /** Override the simulation tick when embedded in a host fixed-step loop. */
  fixedStep?: number;
  obstacles?: readonly VerticalObstacle[];
  startX?: number;
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
export const VERTICAL_WIDTH = 420;
export const VERTICAL_WALL_INSET = 30;
export const VERTICAL_PLAYER_RADIUS = 12;
/** Gate rows start after the tutorial runway; nothing can kill before it. */
export const VERTICAL_FIRST_LETHAL_Y = 900;
export const VERTICAL_SAFE_RUNWAY_Y = 760;
const GATE_WIDTH = 230;

/** Forward speed ramps from a calm entry to the full shaft speed. */
export const VERTICAL_SPEED_START = 170;
export const VERTICAL_SPEED_END = 300;
export const VERTICAL_SPEED_RAMP_SECONDS = 18;
export function verticalForwardSpeed(seconds: number): number {
  const t = Math.max(0, Math.min(1, seconds / VERTICAL_SPEED_RAMP_SECONDS));
  return VERTICAL_SPEED_START + (VERTICAL_SPEED_END - VERTICAL_SPEED_START) * t;
}

/** Course distance covered after `seconds` of the ramp above. */
function verticalDistance(seconds: number): number {
  const ramp = Math.min(seconds, VERTICAL_SPEED_RAMP_SECONDS);
  const a = (VERTICAL_SPEED_END - VERTICAL_SPEED_START) / VERTICAL_SPEED_RAMP_SECONDS;
  return VERTICAL_SPEED_START * ramp + a * ramp * ramp / 2 + Math.max(0, seconds - VERTICAL_SPEED_RAMP_SECONDS) * VERTICAL_SPEED_END;
}

/** Hand-tuned fallback layout: alternating blocked sides. */
export const VERTICAL_SECTION_OBSTACLES: readonly VerticalObstacle[] = Object.freeze(
  [0, 1, 0, 1].map((side, i) => Object.freeze({ x: side ? VERTICAL_WIDTH - GATE_WIDTH : 0, y: VERTICAL_FIRST_LETHAL_Y + i * 520, width: GATE_WIDTH, height: 46 })),
);

/** Seeded, repeatable gate rows. The first row blocks the entry wall so the
 * first decision is a single tap; spacing then tightens gradually, with at
 * most two rows in a row on the same side. */
export function createVerticalSectionCourse(seed: number, count = 9): readonly VerticalObstacle[] {
  let value = seed >>> 0;
  const next = () => {
    value = (value * 1664525 + 1013904223) >>> 0;
    return value / 0x100000000;
  };
  const obstacles: VerticalObstacle[] = [];
  let time = 5.1;
  let previous = 1;
  let repeats = 0;
  for (let i = 0; i < count; i++) {
    let blockedLeft: boolean;
    if (i === 0) blockedLeft = true;
    else if (i === 1) blockedLeft = false;
    else {
      blockedLeft = next() < .5;
      if ((blockedLeft ? 0 : 1) === previous && repeats >= 1) blockedLeft = !blockedLeft;
    }
    const side = blockedLeft ? 0 : 1;
    repeats = side === previous ? repeats + 1 : 0;
    previous = side;
    const height = 40 + Math.floor(next() * 10);
    obstacles.push({
      x: blockedLeft ? 0 : VERTICAL_WIDTH - GATE_WIDTH,
      y: Math.round(verticalDistance(time)),
      width: GATE_WIDTH,
      height,
    });
    // Seconds between rows: generous at first, never below 1.25 s.
    time += Math.max(1.25, 2.4 - .16 * i) + next() * .15;
  }
  return Object.freeze(obstacles.map(obstacle => Object.freeze(obstacle)));
}

/** Rewards teach the controls: a shield on the far wall asks for the first
 * tap, an orb back on the entry wall asks for the second, then one orb sits
 * on the open side just past every gate row. */
export function createVerticalSectionOrbs(obstacles: readonly VerticalObstacle[]): VerticalOrb[] {
  const right = VERTICAL_WIDTH - VERTICAL_WALL_INSET;
  const orbs: VerticalOrb[] = [
    { x: right, y: Math.round(verticalDistance(1.7)), radius: 18, shield: true },
    { x: VERTICAL_WALL_INSET, y: Math.round(verticalDistance(3.2)), radius: 16 },
  ];
  for (const gate of obstacles) {
    if (gate.passive) continue;
    const openRight = gate.x === 0;
    orbs.push({ x: openRight ? right : VERTICAL_WALL_INSET, y: gate.y + gate.height + 70, radius: 14 });
  }
  return orbs;
}

/** The shaft ends a short, clear stretch after the last gate row. */
export function verticalSectionLength(obstacles: readonly VerticalObstacle[]): number {
  const last = obstacles.filter(o => !o.passive).at(-1);
  return last ? last.y + last.height + 300 : 1200;
}

export function createVerticalSection(config: VerticalSectionConfig): VerticalSectionState {
  return {
    x: config.startX ?? config.width / 2,
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
  const radius = config.playerRadius ?? VERTICAL_PLAYER_RADIUS;
  const inset = config.wallInset ?? VERTICAL_WALL_INSET;
  const omega = config.stiffness ?? 15;
  const speed = config.forwardSpeed ?? 240;
  const phase = input.switchPressed ? (state.phase === 0 ? 1 : 0) : state.phase;
  const targetX = phase === 0 ? inset : config.width - inset;
  // Critically damped: the runner zips across in about a third of a second
  // and settles on the wall without overshooting into the far gate.
  const ax = omega * omega * (targetX - state.x) - 2 * omega * state.vx;
  const vx = state.vx + ax * dt;
  const x = Math.max(radius, Math.min(config.width - radius, state.x + vx * dt));
  const y = state.y + speed * dt;
  const crashed = verticalHits({ x, y }, config.obstacles ?? [], radius).length > 0;
  return { x, y, vx, phase, crashed, ticks: state.ticks + 1 };
}

/** Indices of the gate rows the runner overlaps. */
export function verticalHits(at: { x: number; y: number }, obstacles: readonly VerticalObstacle[], radius = VERTICAL_PLAYER_RADIUS): number[] {
  const hits: number[] = [];
  obstacles.forEach((obstacle, i) => {
    if (!obstacle.passive &&
      at.x + radius > obstacle.x && at.x - radius < obstacle.x + obstacle.width &&
      at.y + radius > obstacle.y && at.y - radius < obstacle.y + obstacle.height) hits.push(i);
  });
  return hits;
}
