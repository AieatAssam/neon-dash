import { BEAT_SECONDS } from './rhythm';
import { longGapCrossingAt, longGapCollectiblesAt } from './long-gap-crossing';
import { collectShield, createPowerUpState, resolveCollision, type PowerUpState } from './powerups';
import {
  createVerticalSection, createVerticalSectionCourse, createVerticalSectionOrbs, stepVerticalSection,
  verticalForwardSpeed, verticalHits, verticalSectionLength,
  VERTICAL_PLAYER_RADIUS, VERTICAL_SAFE_RUNWAY_Y, VERTICAL_WALL_INSET, VERTICAL_WIDTH,
  type VerticalOrb, type VerticalSectionState, type VerticalObstacle,
} from './vertical-section';

export { VERTICAL_FIRST_LETHAL_Y, VERTICAL_SAFE_RUNWAY_Y } from './vertical-section';

/**
 * Deterministic, fixed-step runner simulation.
 * Coordinates are in world units; positive y points down.
 */

/** Percentage of the playable distance covered in a finite challenge. */
export function challengeProgress(distance: number, runnerX: number, finishX: number): number {
  return Math.max(0, Math.min(100, distance / (finishX - runnerX) * 100));
}

export type Phase = 0 | 1;
export interface GameConfig {
  mode: 'endless' | 'challenge';
  runnerX: number; runnerWidth: number; runnerHeight: number; groundY: number;
  gravity: number; jumpVelocity: number; speed: number; obstacleWidth: number;
  obstacleHeight: number; obstacleGap: number; obstacleStartX: number;
  finishX: number; maxSpeed: number; seed: number; fixedStep: number;
}
export interface Box { x: number; y: number; width: number; height: number }
export interface Obstacle {
  x: number; width: number; height: number; phase: Phase | null;
  kind?: 'spike' | 'gate' | 'pulse'; pulseTime?: number; cleared?: boolean; groupId?: number; shielded?: boolean;
  /** Opening lessons are tagged so the UI can teach each mechanic once. */
  lesson?: boolean;
}
export interface RunStats { jumps: number; switches: number; cleared: number; neutralCleared: number; orbs: number }
export interface Collectible { x: number; y: number; radius: number }
export interface Terrain { kind: 'gap' | 'platform'; x: number; width: number; height: number; lesson?: boolean }
export interface GameState {
  time: number; speed: number; level: number; stats: RunStats; distance: number; phase: Phase;
  runner: Box & { vy: number; grounded: boolean }; obstacles: Obstacle[]; terrain: Terrain[]; collectibles: Collectible[]; shieldPickups: Collectible[]; powerUps: PowerUpState;
  status: 'running' | 'dead' | 'won'; deathReason: 'obstacle' | 'fall' | 'platform' | null;
  jumpHeld: boolean; jumpBuffer: number; coyoteTime: number;
}
/** Jump is held; phase switching is an edge-triggered action. */
export interface Input { jump?: boolean; togglePhase?: boolean }

type ScriptKind = 'spike' | 'double' | 'gate' | 'gap' | 'platform' | 'shield';
export interface ScriptItem { beat: number; kind: ScriptKind; phase?: Phase; height?: number }

export interface Game {
  config: GameConfig; endless: boolean; generated: boolean; randomState: number; nextCluster: number;
  nextBeat: number; phraseStart: number; phrasePattern: readonly number[]; phraseIndex: number;
  /** Beat of the first motif phrase; motifs are counted from here. */
  phraseOrigin: number;
  /** Authored lesson beats consumed before the motif generator. */
  script: ScriptItem[];
  /** Generation never places a feature beyond this world x (the portal runway). */
  holdAtX: number | null;
  nextObstacleGroup: number;
  accumulator: number; pendingInput: Required<Input>; state: GameState;
  /** One authored color-wall set piece is part of challenge runs. */
  verticalState: VerticalSectionState | null; verticalObstacles: readonly VerticalObstacle[]; verticalComplete: boolean;
  verticalOrbs: VerticalOrb[]; verticalLength: number; verticalCleared: number;
  /** Gate rows broken by a shield; they no longer collide. */
  verticalShattered: number[];
  /** Seconds into the portal warp before vertical play begins. */
  verticalWarp: number | null;
  /** Course y below which obstacles cannot kill the runner (tutorial runway). */
  verticalGraceUntilY: number;
  /** Simulation time of the last scene change, for presentation easing. */
  verticalEnteredAt: number | null; verticalExitedAt: number | null;
}

export const DEFAULT_CONFIG: Readonly<GameConfig> = Object.freeze({
  mode: 'endless',
  runnerX: 100,
  runnerWidth: 24,
  runnerHeight: 24,
  groundY: 300,
  gravity: 1800,
  jumpVelocity: -620,
  speed: 240,
  obstacleWidth: 28,
  obstacleHeight: 42,
  obstacleGap: 240,
  obstacleStartX: 460,
  finishX: Infinity,
  maxSpeed: 340,
  seed: 1,
  fixedStep: 1 / 120,
});

/** Forgiveness tuned for touch screens. */
export const COYOTE_SECONDS = .1;
export const JUMP_BUFFER_SECONDS = .15;
/** Hazard contact ignores this much of the runner's outer edge. */
export const HAZARD_INSET = 3;

/** Default finite course length (about 75 seconds at the normal speed ramp). */
export const CHALLENGE_FINISH_X = 22000;
/** Beat at which the challenge portal opens (about 21 s at the default ramp). */
export const VERTICAL_PORTAL_BEAT = 40;
/** Simulation seconds spent in the portal warp before the shaft begins. */
export const VERTICAL_WARP_SECONDS = .8;
const VERTICAL_RUNWAY_X = 320;
const FIXED_LAYOUT_FINISH_X = 9000;

// Compact clusters fit under one jump at the slowest speed. The runway
// between clusters exceeds a full jump plus a generous reaction interval.
export const CHALLENGE_RECIPES: readonly (readonly (Phase | null)[])[] = Object.freeze([
  Object.freeze([null]), Object.freeze([0]), Object.freeze([1]),
  Object.freeze([null, null]), Object.freeze([0, 1]),
  Object.freeze([1, null]), Object.freeze([null, 0, 1]),
]);
/** Eight-beat motifs repeat as the speed rises, making the course readable.
 * Gate phrases leave four beats between switches; jump phrases leave at least
 * two beats between takeoffs, including at phrase boundaries. */
export const LEVEL_SECTIONS = Object.freeze([
  Object.freeze({ name: 'jump run', beats: Object.freeze([0, 2, 4, 6]) }),
  Object.freeze({ name: 'terrain run', beats: Object.freeze([0, 2, 4]) }),
  Object.freeze({ name: 'phase exchange', beats: Object.freeze([2, 6]) }),
  Object.freeze({ name: 'mixed run', beats: Object.freeze([2, 4, 6]) }),
]);

/** A free shield on the opening runway forgives the first mistake. The first
 * fifteen seconds are single, low spikes four beats apart, each with an orb
 * on its jump arc. One color gate follows, then one more spike. */
export const WARMUP_SCRIPT: readonly ScriptItem[] = Object.freeze([
  { beat: 3, kind: 'shield' }, { beat: 8, kind: 'spike', height: 30 }, { beat: 12, kind: 'spike', height: 30 },
  { beat: 16, kind: 'spike', height: 32 }, { beat: 20, kind: 'spike', height: 34 },
  { beat: 24, kind: 'spike', height: 34 }, { beat: 28, kind: 'spike', height: 34 },
  { beat: 31, kind: 'gate', phase: 0 }, { beat: 35, kind: 'spike', height: 34 },
].map(item => Object.freeze(item as ScriptItem)));

/** Terrain lessons, relative to the beat where they begin. */
export const LESSON_SCRIPT: readonly ScriptItem[] = Object.freeze([
  { beat: 0, kind: 'gap' }, { beat: 4, kind: 'platform' }, { beat: 7, kind: 'shield' },
  { beat: 8, kind: 'double' },
].map(item => Object.freeze(item as ScriptItem)));
const LESSON_BEATS = 12;
const ENDLESS_LESSON_BEAT = 39;

function random(game: Game): number {
  game.randomState = (game.randomState + 0x6D2B79F5) >>> 0;
  let n = game.randomState;
  n = Math.imul(n ^ n >>> 15, n | 1);
  n ^= n + Math.imul(n ^ n >>> 7, n | 61);
  return ((n ^ n >>> 14) >>> 0) / 4294967296;
}

/** Integrate the same capped ramp used by the runner, keeping musical timing
 * stable as the world speeds up. Fixed-step integration differs by < one pixel. */
export function courseDistance(config: GameConfig, time: number): number {
  const capTime = Math.max(0, (config.maxSpeed - config.speed) / 1.2);
  const rampTime = Math.min(time, capTime);
  return Math.min(config.speed, config.maxSpeed) * rampTime + .6 * rampTime * rampTime +
    Math.max(0, time - capTime) * config.maxSpeed;
}

/** Distance at which the challenge portal opens for the default configuration. */
export const VERTICAL_SECTION_START_X = Math.round(courseDistance(DEFAULT_CONFIG, VERTICAL_PORTAL_BEAT * BEAT_SECONDS));
/** The cue gate and banner appear this many units before the portal. */
export const VERTICAL_APPROACH_CUE_X = VERTICAL_SECTION_START_X - 1300;

/** Point the generator at the next authored lesson or motif beat. */
function scheduleNext(game: Game): void {
  game.nextBeat = game.script.length ? game.script[0].beat : game.phraseStart + game.phrasePattern[game.phraseIndex];
  game.nextCluster = game.config.runnerX + courseDistance(game.config, game.nextBeat * BEAT_SECONDS);
}

function startPhrases(game: Game, origin: number): void {
  game.phraseOrigin = origin;
  game.phraseStart = origin;
  game.phraseIndex = 0;
  game.phrasePattern = LEVEL_SECTIONS[0].beats;
}

function addOrb(game: Game, time: number, onGround: boolean): void {
  const c = game.config;
  game.state.collectibles.push({
    x: c.runnerX + courseDistance(c, time) + c.runnerWidth / 2,
    y: c.groundY - (onGround ? c.runnerHeight / 2 : 110), radius: 10,
  });
}

function placeScript(game: Game, item: ScriptItem): void {
  const s = game.state;
  const c = game.config;
  const x = game.nextCluster;
  const time = item.beat * BEAT_SECONDS;
  const groupId = game.nextObstacleGroup++;
  if (item.kind === 'spike' || item.kind === 'double') {
    const count = item.kind === 'double' ? 2 : 1;
    for (let i = 0; i < count; i++) s.obstacles.push({ x: x + i * 28, width: 26, height: item.height ?? 34, phase: null, groupId, lesson: true });
    addOrb(game, time + .16, false);
  } else if (item.kind === 'gate') {
    s.obstacles.push({ x, width: 22, height: 180, phase: item.phase ?? 0, kind: 'gate', groupId, lesson: true });
    addOrb(game, time + .16, true);
  } else if (item.kind === 'gap' || item.kind === 'platform') {
    const gap = item.kind === 'gap';
    s.terrain.push({ kind: item.kind, x, width: gap ? 90 : 84, height: gap ? 0 : 28, lesson: true });
    addOrb(game, time + .16, false);
  } else {
    s.shieldPickups.push({ x, y: c.groundY - c.runnerHeight / 2, radius: 12 });
  }
}

function placePhrase(game: Game): void {
  const s = game.state;
  const c = game.config;
  const scheduledTime = game.nextBeat * BEAT_SECONDS;
  const tier = Math.min(6, 2 + Math.floor(scheduledTime / 15));
  const recipe = CHALLENGE_RECIPES[Math.floor(random(game) * (tier + 1))];
  const height = 34 + Math.floor(random(game) * 4) * 4;
  const phraseNumber = Math.floor((game.phraseStart - game.phraseOrigin) / 8);
  const motif = phraseNumber % LEVEL_SECTIONS.length;
  const gate = motif === 2;
  const terrain = motif === 1 || motif === 3 && game.phraseIndex !== 1;
  const groupId = game.nextObstacleGroup++;
  const crossing = motif === 1;
  if (crossing) {
    // Reserve the entire phrase for a continuous void and its stepping
    // stones. The next phrase starts its gates two beats late, leaving
    // at least 312 units of clear ground after the crossing at speed 240.
    if (game.nextCluster + 1140 <= c.finishX) {
      const crossingOrigin = game.nextCluster - 90;
      const crossingVariant = ((Number(c.seed) >>> 0) + Math.floor(phraseNumber / 4)) % 3;
      s.terrain.push(...longGapCrossingAt(crossingOrigin, crossingVariant));
      s.collectibles.push(...longGapCollectiblesAt(crossingOrigin, c.groundY, crossingVariant));
    }
    game.phraseIndex = game.phrasePattern.length - 1;
  } else if (terrain) {
    s.terrain.push({ kind: 'gap', x: game.nextCluster, width: 100, height: 0 });
  }
  else if (gate) s.obstacles.push({
    x: game.nextCluster, width: 22, height: 180,
    phase: Math.floor(random(game) * 2) as Phase, kind: 'gate', groupId,
  });
  else if ((phraseNumber >= 4 || game.verticalComplete) && motif === 0 && game.phraseIndex === 1) {
    s.obstacles.push({ x: game.nextCluster, width: 64, height: 36,
      phase: null, kind: 'pulse', pulseTime: scheduledTime, groupId });
  }
  else recipe.forEach((phase, i) => s.obstacles.push({
    x: game.nextCluster + i * 28, width: 26, height, phase, groupId,
  }));
  // Orbs follow the required jump near its apex. Gate rewards stay on the
  // ground, so collecting never asks for an additional off-beat jump.
  if (!crossing) addOrb(game, scheduledTime + .16, gate);
  // A shield appears behind a gate at a fixed phrase interval. The pickup
  // is on the ground path, visible in advance, and never depends on RNG.
  if (gate && game.phraseIndex === 0) {
    s.shieldPickups.push({ x: game.nextCluster + 90, y: c.groundY - c.runnerHeight / 2, radius: 12 });
  }
  game.phraseIndex++;
  if (game.phraseIndex >= game.phrasePattern.length) {
    game.phraseStart += 8;
    game.phraseIndex = 0;
    game.phrasePattern = LEVEL_SECTIONS[Math.floor((game.phraseStart - game.phraseOrigin) / 8) % LEVEL_SECTIONS.length].beats;
  }
}

function extendCourse(game: Game): void {
  const s = game.state;
  const c = game.config;
  const limit = Math.min(s.distance + 2400, c.finishX - 400);
  while (game.nextCluster < limit && (game.holdAtX === null || game.nextCluster <= game.holdAtX)) {
    if (game.script.length) placeScript(game, game.script.shift()!);
    else placePhrase(game);
    scheduleNext(game);
  }
  // Keep the live obstacle array stable. This runs on every fixed simulation
  // step, so Array#filter would otherwise allocate a fresh array 120 times a
  // second during an endless run.
  let write = 0;
  for (let read = 0; read < s.obstacles.length; read++) {
    const obstacle = s.obstacles[read];
    if (obstacle.x + obstacle.width > s.distance - 100) {
      s.obstacles[write++] = obstacle;
    }
  }
  s.obstacles.length = write;
  write = 0;
  for (const terrain of s.terrain) {
    if (terrain.x + terrain.width > s.distance - 100) s.terrain[write++] = terrain;
  }
  s.terrain.length = write;
  write = 0;
  for (const orb of s.collectibles) {
    if (orb.x + orb.radius >= s.distance - 100) s.collectibles[write++] = orb;
  }
  s.collectibles.length = write;
  write = 0;
  for (const pickup of s.shieldPickups) {
    if (pickup.x + pickup.radius >= s.distance - 100) s.shieldPickups[write++] = pickup;
  }
  s.shieldPickups.length = write;
}

/** After the shaft, leave about 2.6 s of clear runway, teach terrain, then
 * continue with the motif phrases. */
export function resumeAfterVertical(game: Game): void {
  game.verticalComplete = true;
  const resume = Math.ceil(game.state.time / BEAT_SECONDS) + 5;
  game.script = LESSON_SCRIPT.map(item => ({ ...item, beat: item.beat + resume }));
  startPhrases(game, resume + LESSON_BEATS);
  game.holdAtX = null;
  scheduleNext(game);
}

/** A one-beat warning precedes a solid, half-second floor burst.
 * Rendering and collision share this state; simulation time also freezes on pause. */
export function floorPulseState(obstacle: Obstacle, time: number): 'dormant' | 'warning' | 'active' {
  const arrival = obstacle.pulseTime ?? 0;
  if (time >= arrival - .25 && time < arrival + .3) return 'active';
  if (time >= arrival - .25 - BEAT_SECONDS && time < arrival - .25) return 'warning';
  return 'dormant';
}

function overlaps(a: Box, b: Box): boolean {
  return a.x < b.x + b.width && a.x + a.width > b.x &&
    a.y < b.y + b.height && a.y + a.height > b.y;
}

/** Keep both scene changes on a grounded, visible stretch of the horizontal course. */
function hasHorizontalRunway(game: Game): boolean {
  const s = game.state;
  const worldX = s.distance + s.runner.x;
  const terrainAhead = s.terrain.some(t => t.x + t.width > worldX - 20 && t.x < worldX + VERTICAL_RUNWAY_X);
  const hazardAhead = s.obstacles.some(o => !o.cleared && o.x + o.width > worldX - 20 && o.x < worldX + VERTICAL_RUNWAY_X);
  return !terrainAhead && !hazardAhead;
}

/** Explicit challenge mode keeps seeded generation and adds a finite finish.
 * Layout overrides without a mode retain the original fixed-course behavior. */
export function createGame(overrides: Partial<GameConfig> = {}): Game {
  const layoutOverride = ["obstacleStartX", "obstacleGap", "obstacleWidth", "obstacleHeight"].some(key => Object.hasOwn(overrides, key));
  const config = { ...DEFAULT_CONFIG, ...(overrides.mode === 'challenge'
    ? { finishX: CHALLENGE_FINISH_X }
    : layoutOverride ? { finishX: FIXED_LAYOUT_FINISH_X } : {}), ...overrides };
  if ((config.mode === 'challenge' && !Number.isFinite(config.finishX)) || !(config.fixedStep > 0) || !(config.speed >= 0) || !(config.finishX > config.runnerX)) {
    throw new RangeError("Invalid simulation configuration");
  }
  const customLayout = ["obstacleStartX", "obstacleGap", "obstacleWidth", "obstacleHeight", "finishX"].some(key => Object.hasOwn(overrides, key)) && overrides.mode !== 'challenge';
  const obstacleCount = customLayout ? Math.max(0, Math.ceil((config.finishX - config.obstacleStartX) / config.obstacleGap)) : 0;
  const obstacles: Obstacle[] = customLayout ? Array.from({ length: obstacleCount }, (_, i) => ({
    x: config.obstacleStartX + i * config.obstacleGap,
    width: config.obstacleWidth,
    height: config.obstacleHeight,
    phase: (i % 2) as Phase, groupId: i,
  })) : [];

  const challenge = config.mode === 'challenge';
  const verticalObstacles = createVerticalSectionCourse(Number(config.seed) >>> 0);
  const script = WARMUP_SCRIPT.map(item => ({ ...item }));
  if (!challenge) script.push(...LESSON_SCRIPT.map(item => ({ ...item, beat: item.beat + ENDLESS_LESSON_BEAT })));
  const game: Game = {
    config,
    endless: !customLayout && !challenge,
    generated: !customLayout,
    randomState: Number(config.seed) >>> 0,
    nextCluster: 0, nextBeat: 0,
    phraseStart: 0, phrasePattern: LEVEL_SECTIONS[0].beats, phraseIndex: 0, phraseOrigin: 0,
    script,
    holdAtX: challenge ? config.runnerX + VERTICAL_SECTION_START_X - 200 : null,
    nextObstacleGroup: obstacleCount,
    accumulator: 0,
    pendingInput: { jump: false, togglePhase: false },
    verticalState: null,
    verticalObstacles,
    verticalComplete: false,
    verticalOrbs: createVerticalSectionOrbs(verticalObstacles),
    verticalLength: verticalSectionLength(verticalObstacles),
    verticalCleared: 0,
    verticalShattered: [],
    verticalWarp: null,
    verticalGraceUntilY: 0,
    verticalEnteredAt: null, verticalExitedAt: null,
    state: {
      time: 0,
      speed: config.speed,
      level: 1,
      stats: { jumps: 0, switches: 0, cleared: 0, neutralCleared: 0, orbs: 0 },
      distance: 0,
      phase: 0,
      runner: { x: config.runnerX, y: config.groundY - config.runnerHeight, width: config.runnerWidth,
        height: config.runnerHeight, vy: 0, grounded: true },
      obstacles,
      terrain: [],
      collectibles: [],
      shieldPickups: [],
      powerUps: createPowerUpState(),
      status: "running",
      deathReason: null,
      jumpHeld: false,
      jumpBuffer: 0,
      coyoteTime: 0,
    },
  };
  // Challenge phrases start after the shaft; a far finite beat keeps checkpoints valid.
  startPhrases(game, challenge ? 1e9 : ENDLESS_LESSON_BEAT + LESSON_BEATS);
  scheduleNext(game);
  if (game.generated) extendCourse(game);
  return game;
}

/** Start the shaft at the entry wall that the rotated runway becomes. */
export function enterVertical(game: Game): void {
  const s = game.state;
  const c = game.config;
  const vertical = createVerticalSection({ width: VERTICAL_WIDTH, height: 900, obstacles: game.verticalObstacles, startX: VERTICAL_WALL_INSET });
  vertical.phase = s.phase;
  game.verticalGraceUntilY = VERTICAL_SAFE_RUNWAY_Y;
  game.verticalCleared = 0;
  s.runner.y = c.groundY - s.runner.height;
  s.runner.vy = 0;
  s.runner.grounded = true;
  s.jumpHeld = false; s.jumpBuffer = 0; s.coyoteTime = 0;
  game.verticalState = vertical;
  game.verticalWarp = null;
  game.verticalEnteredAt = s.time;
}

function stepVertical(game: Game, input: Input): GameState {
  const s = game.state;
  const c = game.config;
  const dt = c.fixedStep;
  s.time += dt;
  s.speed = game.generated ? Math.min(c.maxSpeed, c.speed + s.time * 1.2) : c.speed;
  s.level = 1 + Math.floor(s.time / 20);
  const current = game.verticalState!;
  let next = stepVerticalSection(current, { switchPressed: Boolean(input.togglePhase) }, {
    width: VERTICAL_WIDTH, height: 900, obstacles: game.verticalObstacles,
    forwardSpeed: verticalForwardSpeed(current.ticks * dt), fixedStep: dt,
  });
  if (input.togglePhase) s.stats.switches++;
  s.phase = next.phase;
  // Horizontal distance keeps the beat-synced course clock running.
  s.distance += s.speed * dt;
  if (game.generated) extendCourse(game);
  let live = 0;
  for (const orb of game.verticalOrbs) {
    const dx = orb.x - next.x, dy = orb.y - next.y, reach = orb.radius + VERTICAL_PLAYER_RADIUS;
    if (dx * dx + dy * dy > reach * reach) game.verticalOrbs[live++] = orb;
    else if (orb.shield) s.powerUps = collectShield(s.powerUps);
    else s.stats.orbs++;
  }
  game.verticalOrbs.length = live;
  while (game.verticalCleared < game.verticalObstacles.length) {
    const gate = game.verticalObstacles[game.verticalCleared];
    if (next.y - VERTICAL_PLAYER_RADIUS <= gate.y + gate.height) break;
    game.verticalCleared++;
    if (!gate.passive) s.stats.cleared++;
  }
  if (next.crashed) {
    const hits = verticalHits(next, game.verticalObstacles).filter(i => !game.verticalShattered.includes(i));
    if (next.y < game.verticalGraceUntilY || hits.length === 0) next = { ...next, crashed: false };
    else {
      const result = resolveCollision(s.powerUps, true);
      if (result.absorbed) {
        s.powerUps = result.state;
        game.verticalShattered.push(...hits);
        next = { ...next, crashed: false };
      } else { game.verticalState = next; s.status = 'dead'; s.deathReason = 'obstacle'; return s; }
    }
  }
  game.verticalState = next;
  if (next.y >= game.verticalLength && hasHorizontalRunway(game)) {
    game.verticalState = null;
    game.verticalComplete = true;
    game.verticalExitedAt = s.time;
    s.runner.y = c.groundY - s.runner.height;
    s.runner.vy = 0;
    s.runner.grounded = true;
    s.jumpHeld = false; s.jumpBuffer = 0; s.coyoteTime = 0;
    if (game.generated) { resumeAfterVertical(game); extendCourse(game); }
  }
  return s;
}

/** Advance exactly one fixed simulation step. Jump remains active while held; phase toggles apply once per step. */
export function step(game: Game, input: Input = {}): GameState {
  const s = game.state;
  const c = game.config;
  if (s.status !== "running") return s;

  // The color-wall set piece temporarily replaces the horizontal playfield.
  // It uses the same fixed step and phase state, so retries/checkpoints stay deterministic.
  if (game.verticalState) return stepVertical(game, input);
  // The runner rides a clear runway through the portal; inputs wait for the shaft.
  if (game.verticalWarp !== null) input = {};

  if (input.togglePhase) { s.phase = s.phase === 0 ? 1 : 0; s.stats.switches++; }
  // A small grace window makes an edge press behave like the jump the player
  // intended. Consume it on takeoff so it cannot become an airborne jump.
  s.coyoteTime = s.runner.grounded ? COYOTE_SECONDS : Math.max(0, s.coyoteTime - c.fixedStep);
  if (input.jump && !s.jumpHeld) s.jumpBuffer = JUMP_BUFFER_SECONDS;
  if ((input.jump || s.jumpBuffer > 0) && (s.runner.grounded || s.coyoteTime > 0)) {
    s.jumpBuffer = 0;
    s.coyoteTime = 0;
    s.stats.jumps++;
    s.runner.vy = c.jumpVelocity;
    s.runner.grounded = false;
  }
  s.jumpHeld = Boolean(input.jump);

  const dt = c.fixedStep;
  s.jumpBuffer = Math.max(0, s.jumpBuffer - dt);
  s.time += dt;
  s.speed = game.generated ? Math.min(c.maxSpeed, c.speed + s.time * 1.2) : c.speed;
  s.level = 1 + Math.floor(s.time / 20);
  const previousWorldX = s.distance + s.runner.x;
  s.distance += s.speed * dt;
  if (game.generated) extendCourse(game);
  const previousBottom = s.runner.y + s.runner.height;
  s.runner.grounded = false;
  s.runner.vy += c.gravity * dt;
  s.runner.y += s.runner.vy * dt;
  const floor = c.groundY - s.runner.height;
  const worldX = s.distance + s.runner.x;
  const centerX = worldX + s.runner.width / 2;
  const overGap = s.terrain.some(t => t.kind === 'gap' && centerX > t.x && centerX < t.x + t.width);
  if (!overGap && s.runner.y >= floor && previousBottom <= c.groundY + 2) {
    s.runner.y = floor;
    s.runner.vy = 0;
    s.runner.grounded = true;
  }

  for (const terrain of s.terrain) {
    if (terrain.kind !== 'platform' || worldX + s.runner.width <= terrain.x || worldX >= terrain.x + terrain.width) continue;
    const top = c.groundY - terrain.height;
    if (s.runner.vy >= 0 && previousBottom <= top + .01 && s.runner.y + s.runner.height >= top) {
      s.runner.y = top - s.runner.height;
      s.runner.vy = 0;
      s.runner.grounded = true;
    } else if (overlaps({ x: worldX, y: s.runner.y, width: s.runner.width, height: s.runner.height }, { x: terrain.x, y: top, width: terrain.width, height: terrain.height })) {
      s.status = 'dead'; s.deathReason = 'platform'; return s;
    }
  }
  if (s.runner.y > c.groundY + 100) { s.status = 'dead'; s.deathReason = 'fall'; return s; }

  const runnerBox = { x: s.distance + s.runner.x, y: s.runner.y, width: s.runner.width, height: s.runner.height };
  // Hazards use a slightly smaller body, so grazing an edge feels fair.
  const inset = Math.min(HAZARD_INSET, s.runner.width * .15);
  // Sweep horizontally across this step so valid high-speed configurations
  // cannot skip narrow hazards between two fixed simulation positions.
  const collisionBox = {
    x: previousWorldX + inset,
    y: runnerBox.y + inset,
    width: runnerBox.x + runnerBox.width - previousWorldX - inset * 2,
    height: runnerBox.height - inset,
  };
  for (const obstacle of s.obstacles) {
    if (obstacle.shielded) continue;
    if (!obstacle.cleared && obstacle.x + obstacle.width < runnerBox.x) {
      obstacle.cleared = true; s.stats.cleared++;
      if (obstacle.phase === null) s.stats.neutralCleared++;
    }
    if (obstacle.kind === 'pulse' && floorPulseState(obstacle, s.time) !== 'active') continue;
    if (obstacle.phase !== null && obstacle.phase !== s.phase) continue;
    const box = { x: obstacle.x, y: c.groundY - obstacle.height, width: obstacle.width, height: obstacle.height };
    // At the bottom edge of the runner the triangle is widest.
    const depth = Math.min(box.height, collisionBox.y + collisionBox.height - box.y);
    const halfWidth = box.width * Math.max(0, depth) / (2 * box.height);
    const slice = { x: box.x + box.width / 2 - halfWidth, y: box.y, width: 2 * halfWidth, height: box.height };
    if (overlaps(collisionBox, obstacle.kind === 'gate' || obstacle.kind === 'pulse' ? box : slice)) {
      const result = resolveCollision(s.powerUps, true);
      if (result.absorbed) {
        s.powerUps = result.state;
        for (const member of s.obstacles) {
          if (member === obstacle || obstacle.groupId !== undefined && member.groupId === obstacle.groupId) member.shielded = true;
        }
        continue;
      }
      s.status = "dead";
      s.deathReason = "obstacle";
      return s;
    }
  }
  // Circle-to-box collection is phase independent and never changes movement.
  let liveOrbs = 0;
  for (const orb of s.collectibles) {
    const dx = orb.x - Math.max(runnerBox.x, Math.min(orb.x, runnerBox.x + runnerBox.width));
    const dy = orb.y - Math.max(runnerBox.y, Math.min(orb.y, runnerBox.y + runnerBox.height));
    if (dx * dx + dy * dy <= orb.radius * orb.radius) s.stats.orbs++;
    else s.collectibles[liveOrbs++] = orb;
  }
  s.collectibles.length = liveOrbs;
  let liveShieldPickups = 0;
  for (const pickup of s.shieldPickups) {
    const dx = pickup.x - Math.max(runnerBox.x, Math.min(pickup.x, runnerBox.x + runnerBox.width));
    const dy = pickup.y - Math.max(runnerBox.y, Math.min(pickup.y, runnerBox.y + runnerBox.height));
    if (dx * dx + dy * dy <= pickup.radius * pickup.radius) s.powerUps = collectShield(s.powerUps);
    else s.shieldPickups[liveShieldPickups++] = pickup;
  }
  s.shieldPickups.length = liveShieldPickups;
  if (s.distance + s.runner.x >= c.finishX) s.status = "won";
  if (s.status === 'running' && c.mode === 'challenge' && !game.verticalComplete) {
    if (game.verticalWarp === null && s.distance >= VERTICAL_SECTION_START_X && s.runner.grounded && hasHorizontalRunway(game)) {
      game.verticalWarp = 0;
    } else if (game.verticalWarp !== null) {
      game.verticalWarp += dt;
      if (game.verticalWarp >= VERTICAL_WARP_SECONDS) enterVertical(game);
    }
  }
  return s;
}

/** Advance elapsed wall time in deterministic fixed-size increments. */
export function advance(game: Game, elapsed: number, input: Input = {}): GameState {
  if (!Number.isFinite(elapsed) || elapsed < 0) throw new RangeError("elapsed must be a finite non-negative number");
  const stepSize = game.config.fixedStep;
  game.accumulator += elapsed;
  game.pendingInput.jump ||= Boolean(input.jump);
  game.pendingInput.togglePhase ||= Boolean(input.togglePhase);
  while (game.accumulator + Number.EPSILON >= stepSize && game.state.status === "running") {
    step(game, { ...game.pendingInput, jump: game.pendingInput.jump || Boolean(input.jump) });
    game.pendingInput = { jump: false, togglePhase: false };
    game.accumulator = Math.max(0, game.accumulator - stepSize);
  }
  return game.state;
}
