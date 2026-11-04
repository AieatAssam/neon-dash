import { BEAT_SECONDS } from './rhythm';
import { collectShield, createPowerUpState, resolveCollision, type PowerUpState } from './powerups';
import { colorAttractionAcceleration, type ColorAttractionField } from './color-attraction';

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
}
export interface RunStats { jumps: number; switches: number; cleared: number; neutralCleared: number; orbs: number }
export interface Collectible { x: number; y: number; radius: number }
export interface Terrain { kind: 'gap' | 'platform'; x: number; width: number; height: number }
export interface GameState {
  time: number; speed: number; level: number; stats: RunStats; distance: number; phase: Phase;
  runner: Box & { vy: number; grounded: boolean }; obstacles: Obstacle[]; terrain: Terrain[]; collectibles: Collectible[]; shieldPickups: Collectible[]; attractionFields: ColorAttractionField[]; powerUps: PowerUpState;
  status: 'running' | 'dead' | 'won'; deathReason: 'obstacle' | 'fall' | 'platform' | null;
  jumpHeld: boolean; jumpBuffer: number; coyoteTime: number;
}
/** Jump is held; phase switching is an edge-triggered action. */
export interface Input { jump?: boolean; togglePhase?: boolean }
export interface Game {
  config: GameConfig; endless: boolean; generated: boolean; randomState: number; nextCluster: number;
  nextBeat: number; phraseStart: number; phrasePattern: readonly number[]; phraseIndex: number;
  nextObstacleGroup: number; nextAttractionX: number; nextAttractionIndex: number;
  accumulator: number; pendingInput: Required<Input>; state: GameState;
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

/** Default finite course length (about one minute at the normal speed ramp). */
export const CHALLENGE_FINISH_X = 18000;
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
  Object.freeze({ name: 'phase exchange', beats: Object.freeze([0, 4]) }),
  Object.freeze({ name: 'mixed run', beats: Object.freeze([0, 2, 6]) }),
]);

function random(game: Game): number {
  game.randomState = (game.randomState + 0x6D2B79F5) >>> 0;
  let n = game.randomState;
  n = Math.imul(n ^ n >>> 15, n | 1);
  n ^= n + Math.imul(n ^ n >>> 7, n | 61);
  return ((n ^ n >>> 14) >>> 0) / 4294967296;
}

/** Integrate the same capped ramp used by the runner, keeping musical timing
 * stable as the world speeds up. Fixed-step integration differs by < one pixel. */
function courseDistance(config: GameConfig, time: number): number {
  const capTime = Math.max(0, (config.maxSpeed - config.speed) / 1.2);
  const rampTime = Math.min(time, capTime);
  return Math.min(config.speed, config.maxSpeed) * rampTime + .6 * rampTime * rampTime +
    Math.max(0, time - capTime) * config.maxSpeed;
}

function extendCourse(game: Game): void {
  const s = game.state;
  const c = game.config;
  while (game.nextCluster < Math.min(s.distance + 2400, c.finishX - 400)) {
    const scheduledTime = game.nextBeat * BEAT_SECONDS;
    const tier = Math.min(6, 2 + Math.floor(scheduledTime / 15));
    const recipe = CHALLENGE_RECIPES[Math.floor(random(game) * (tier + 1))];
    const height = 34 + Math.floor(random(game) * 4) * 4;
    // The opening introduces one phase gate and one terrain jump. After
    // that, complete phrases teach a recognizable action sequence instead of
    // independently rolling every hazard. The seed varies each repetition.
    const opening = game.phraseStart === 8;
    // Terrain-first seeds put the gate at beat 12, leaving four beats
    // before the next phrase. Gate-first seeds leave the terrain until 14.
    const gateFirst = (Number(c.seed) >>> 0) % 2 === 1;
    const openingGate = opening && game.phraseIndex === (gateFirst ? 0 : 1);
    const openingTerrain = opening && !openingGate;
    const motif = Math.floor((game.phraseStart - 16) / 8) % LEVEL_SECTIONS.length;
    const gate = openingGate || !opening && motif === 2;
    const terrain = openingTerrain || !opening && (motif === 1 || motif === 3 && game.phraseIndex !== 1);
    const groupId = game.nextObstacleGroup++;
    if (terrain) {
      // The terrain phrase teaches a short climb before a gap, then gives a
      // full four-beat approach to the next gate. Heights stay low enough to
      // clear from the ground and land safely when approached with a jump.
      // Mixed runs bookend their spike cluster with single-jump-width gaps.
      const climbingPlatform = !openingTerrain && motif === 1 && game.phraseIndex < 2;
      const gap = openingTerrain ? random(game) < .5 : motif === 3 || motif === 1 && game.phraseIndex === 2;
      const platformHeight = climbingPlatform
        ? (game.phraseIndex === 0 ? 24 : 32)
        : 28;
      if (climbingPlatform) {
        // A short void directly after each ledge makes the climb require a
        // takeoff and landing, instead of reading as a pair of raised bumps.
        const width = 68;
        const x = game.nextCluster;
        s.terrain.push({ kind: 'platform', x, width, height: platformHeight });
        s.terrain.push({ kind: 'gap', x: x + width, width: 40, height: 0 });
      } else {
      s.terrain.push({
        kind: gap ? 'gap' : 'platform', x: game.nextCluster,
        width: openingTerrain ? (gap ? 90 : 80) : (gap ? 100 : 96),
        height: gap ? 0 : platformHeight,
      });
      }
    }
    else if (gate) s.obstacles.push({
      x: game.nextCluster, width: 22, height: 180,
      phase: Math.floor(random(game) * 2) as Phase, kind: 'gate', groupId,
    });
    else if (game.phraseStart >= 48 && motif === 0 && game.phraseIndex === 1) {
      s.obstacles.push({ x: game.nextCluster, width: 64, height: 36,
        phase: null, kind: 'pulse', pulseTime: scheduledTime, groupId });
    }
    else recipe.forEach((phase, i) => s.obstacles.push({
      x: game.nextCluster + i * 28, width: 26, height, phase, groupId,
    }));
    // Orbs follow the required jump near its apex. Gate rewards stay on the
    // ground, so collecting never asks for an additional off-beat jump.
    const orbTime = scheduledTime + .16;
    s.collectibles.push({
      x: c.runnerX + courseDistance(c, orbTime) + c.runnerWidth / 2,
      y: c.groundY - (gate ? c.runnerHeight / 2 : 110), radius: 10,
    });
    // A shield appears behind a gate at a fixed phrase interval. The pickup
    // is on the ground path, visible in advance, and never depends on RNG.
    if (gate && !openingGate && motif === 2 && game.phraseIndex === 0) {
      s.shieldPickups.push({
        x: game.nextCluster + 90,
        y: c.groundY - c.runnerHeight / 2,
        radius: 12,
      });
    }
    game.phraseIndex++;
    if (game.phraseIndex >= game.phrasePattern.length) {
      game.phraseStart += 8;
      game.phraseIndex = 0;
      game.phrasePattern = LEVEL_SECTIONS[Math.floor((game.phraseStart - 16) / 8) % LEVEL_SECTIONS.length].beats;
    }
    game.nextBeat = game.phraseStart + game.phrasePattern[game.phraseIndex];
    game.nextCluster = c.runnerX + courseDistance(c, game.nextBeat * BEAT_SECONDS);
  }
  // A low-frequency series keeps the color-pull mechanic present after its
  // tutorial. The first beacon is deliberately on a clear runway; later ones
  // are deterministic and spaced far enough apart that their forces cannot stack.
  while (game.nextAttractionX < Math.min(s.distance + 2400, c.finishX - 180)) {
    s.attractionFields.push({
      x: game.nextAttractionX,
      y: c.groundY - 130,
      radius: 180,
      phase: (game.nextAttractionIndex % 2) as Phase,
      maxAcceleration: Math.min(1200, c.gravity * .75),
    });
    game.nextAttractionIndex++;
    game.nextAttractionX = c.runnerX + 450 + game.nextAttractionIndex * 4200;
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
  write = 0;
  for (const field of s.attractionFields) {
    if (field.x + field.radius >= s.distance - 100) s.attractionFields[write++] = field;
  }
  s.attractionFields.length = write;
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

  const game: Game = {
    config,
    endless: !customLayout && config.mode !== 'challenge',
    generated: !customLayout,
    randomState: Number(config.seed) >>> 0,
    nextCluster: config.runnerX + courseDistance(config, 8 * BEAT_SECONDS),
    nextBeat: 8, phraseStart: 8, phrasePattern: (Number(config.seed) >>> 0) % 2 === 1 ? [0, 6] : [0, 4], phraseIndex: 0,
    nextObstacleGroup: obstacleCount,
    nextAttractionX: config.runnerX + 450,
    nextAttractionIndex: 0,
    accumulator: 0,
    pendingInput: { jump: false, togglePhase: false },
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
      attractionFields: [],
      powerUps: createPowerUpState(),
      status: "running",
      deathReason: null,
      jumpHeld: false,
      jumpBuffer: 0,
      coyoteTime: 0,
    },
  };
  if (game.generated) extendCourse(game);
  return game;
}

/** Advance exactly one fixed simulation step. Jump remains active while held; phase toggles apply once per step. */
export function step(game: Game, input: Input = {}): GameState {
  const s = game.state;
  const c = game.config;
  if (s.status !== "running") return s;

  if (input.togglePhase) { s.phase = s.phase === 0 ? 1 : 0; s.stats.switches++; }
  // A small grace window makes an edge press behave like the jump the player
  // intended. Consume it on takeoff so it cannot become an airborne jump.
  s.coyoteTime = s.runner.grounded ? .08 : Math.max(0, s.coyoteTime - c.fixedStep);
  if (input.jump && !s.jumpHeld) s.jumpBuffer = .1;
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
  const airborne = !s.runner.grounded;
  s.runner.grounded = false;
  let verticalAcceleration = c.gravity;
  if (airborne) {
    const runnerCenter = { x: previousWorldX + s.runner.width / 2, y: s.runner.y + s.runner.height / 2 };
    for (const field of s.attractionFields) {
      verticalAcceleration += colorAttractionAcceleration(runnerCenter, field, s.phase);
    }
  }
  s.runner.vy += verticalAcceleration * dt;
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
  // Sweep horizontally across this step so valid high-speed configurations
  // cannot skip narrow hazards between two fixed simulation positions.
  const collisionBox = {
    ...runnerBox,
    x: previousWorldX,
    width: runnerBox.x + runnerBox.width - previousWorldX,
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
    const depth = Math.min(box.height, runnerBox.y + runnerBox.height - box.y);
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
