/**
 * Deterministic, fixed-step runner simulation.
 * Coordinates are in world units; positive y points down.
 */

export type Phase = 0 | 1;
export interface GameConfig {
  runnerX: number; runnerWidth: number; runnerHeight: number; groundY: number;
  gravity: number; jumpVelocity: number; speed: number; obstacleWidth: number;
  obstacleHeight: number; obstacleGap: number; obstacleStartX: number;
  finishX: number; maxSpeed: number; seed: number; fixedStep: number;
}
export interface Box { x: number; y: number; width: number; height: number }
export interface Obstacle {
  x: number; width: number; height: number; phase: Phase | null;
  kind?: 'spike' | 'gate'; cleared?: boolean;
}
export interface RunStats { jumps: number; switches: number; cleared: number; neutralCleared: number }
export interface Terrain { kind: 'gap' | 'platform'; x: number; width: number; height: number }
export interface GameState {
  time: number; speed: number; level: number; stats: RunStats; distance: number; phase: Phase;
  runner: Box & { vy: number; grounded: boolean }; obstacles: Obstacle[]; terrain: Terrain[];
  status: 'running' | 'dead' | 'won'; deathReason: 'obstacle' | 'fall' | 'platform' | null;
  jumpHeld: boolean; jumpBuffer: number;
}
export interface Input { jump?: boolean; togglePhase?: boolean }
export interface Game {
  config: GameConfig; endless: boolean; randomState: number; nextCluster: number;
  accumulator: number; pendingInput: Required<Input>; state: GameState;
}

export const DEFAULT_CONFIG: Readonly<GameConfig> = Object.freeze({
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

// Compact clusters fit under one jump at the slowest speed. The runway
// between clusters exceeds a full jump plus a generous reaction interval.
export const CHALLENGE_RECIPES: readonly (readonly (Phase | null)[])[] = Object.freeze([
  Object.freeze([null]), Object.freeze([0]), Object.freeze([1]),
  Object.freeze([null, null]), Object.freeze([0, 1]),
  Object.freeze([1, null]), Object.freeze([null, 0, 1]),
]);
export const LEVEL_SECTIONS = Object.freeze([]);

function random(game: Game): number {
  game.randomState = (game.randomState + 0x6D2B79F5) >>> 0;
  let n = game.randomState;
  n = Math.imul(n ^ n >>> 15, n | 1);
  n ^= n + Math.imul(n ^ n >>> 7, n | 61);
  return ((n ^ n >>> 14) >>> 0) / 4294967296;
}

function extendCourse(game: Game): void {
  const s = game.state;
  while (game.nextCluster < s.distance + 2400) {
    const tier = Math.min(6, 2 + Math.floor(s.time / 15));
    const recipe = CHALLENGE_RECIPES[Math.floor(random(game) * (tier + 1))];
    const height = 34 + Math.floor(random(game) * 4) * 4;
    const gate = tier >= 3 && random(game) < .28;
    const terrain = tier >= 3 && random(game) < .3;
    if (terrain) {
      const gap = random(game) < .5;
      s.terrain.push({ kind: gap ? 'gap' : 'platform', x: game.nextCluster, width: gap ? 90 : 110, height: gap ? 0 : 28 });
    }
    else if (gate) s.obstacles.push({ x: game.nextCluster, width: 22, height: 180, phase: random(game) < .5 ? 0 : 1, kind: 'gate' });
    else recipe.forEach((phase, i) => s.obstacles.push({
      x: game.nextCluster + i * 28, width: 26, height, phase,
    }));
    game.nextCluster += 360 + Math.floor(random(game) * 100);
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
}

function overlaps(a: Box, b: Box): boolean {
  return a.x < b.x + b.width && a.x + a.width > b.x &&
    a.y < b.y + b.height && a.y + a.height > b.y;
}

export function createGame(overrides: Partial<GameConfig> = {}): Game {
  const layoutOverride = ["obstacleStartX", "obstacleGap", "obstacleWidth", "obstacleHeight"].some(key => Object.hasOwn(overrides, key));
  const config = { ...DEFAULT_CONFIG, ...(layoutOverride ? { finishX: 9000 } : {}), ...overrides };
  if (!(config.fixedStep > 0) || !(config.speed >= 0) || !(config.finishX > config.runnerX)) {
    throw new RangeError("Invalid simulation configuration");
  }
  const obstacleCount = Math.max(0, Math.ceil((config.finishX - config.obstacleStartX) / config.obstacleGap));
  const customLayout = ["obstacleStartX", "obstacleGap", "obstacleWidth", "obstacleHeight", "finishX"].some(key => Object.hasOwn(overrides, key));
  const obstacles: Obstacle[] = customLayout ? Array.from({ length: obstacleCount }, (_, i) => ({
    x: config.obstacleStartX + i * config.obstacleGap,
    width: config.obstacleWidth,
    height: config.obstacleHeight,
    phase: (i % 2) as Phase,
  })) : [];

  const game: Game = {
    config,
    endless: !customLayout,
    randomState: Number(config.seed) >>> 0,
    nextCluster: 560,
    accumulator: 0,
    pendingInput: { jump: false, togglePhase: false },
    state: {
      time: 0,
      speed: config.speed,
      level: 1,
      stats: { jumps: 0, switches: 0, cleared: 0, neutralCleared: 0 },
      distance: 0,
      phase: 0,
      runner: { x: config.runnerX, y: config.groundY - config.runnerHeight, width: config.runnerWidth,
        height: config.runnerHeight, vy: 0, grounded: true },
      obstacles,
      terrain: [],
      status: "running",
      deathReason: null,
      jumpHeld: false,
      jumpBuffer: 0,
    },
  };
  if (game.endless) extendCourse(game);
  return game;
}

/** Advance exactly one fixed simulation step. Inputs are edge-triggered for this step. */
export function step(game: Game, input: Input = {}): GameState {
  const s = game.state;
  const c = game.config;
  if (s.status !== "running") return s;

  if (input.togglePhase) { s.phase = s.phase === 0 ? 1 : 0; s.stats.switches++; }
  if (input.jump && !s.jumpHeld) s.jumpBuffer = .1;
  if (s.jumpBuffer > 0 && s.runner.grounded) {
    s.jumpBuffer = 0;
    s.stats.jumps++;
    s.runner.vy = c.jumpVelocity;
    s.runner.grounded = false;
  }
  s.jumpHeld = Boolean(input.jump);

  const dt = c.fixedStep;
  s.jumpBuffer = Math.max(0, s.jumpBuffer - dt);
  s.time += dt;
  s.speed = game.endless ? Math.min(c.maxSpeed, c.speed + s.time * 1.2) : c.speed;
  s.level = 1 + Math.floor(s.time / 20);
  s.distance += s.speed * dt;
  if (game.endless) extendCourse(game);
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
  for (const obstacle of s.obstacles) {
    if (!obstacle.cleared && obstacle.x + obstacle.width < runnerBox.x) {
      obstacle.cleared = true; s.stats.cleared++;
      if (obstacle.phase === null) s.stats.neutralCleared++;
    }
    if (obstacle.phase !== null && obstacle.phase !== s.phase) continue;
    const box = { x: obstacle.x, y: c.groundY - obstacle.height, width: obstacle.width, height: obstacle.height };
    // At the bottom edge of the runner the triangle is widest.
    const depth = Math.min(box.height, runnerBox.y + runnerBox.height - box.y);
    const halfWidth = box.width * Math.max(0, depth) / (2 * box.height);
    const slice = { x: box.x + box.width / 2 - halfWidth, y: box.y, width: 2 * halfWidth, height: box.height };
    if (overlaps(runnerBox, obstacle.kind === 'gate' ? box : slice)) {
      s.status = "dead";
      s.deathReason = "obstacle";
      return s;
    }
  }
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
    step(game, game.pendingInput);
    game.pendingInput = { jump: false, togglePhase: false };
    game.accumulator = Math.max(0, game.accumulator - stepSize);
  }
  return game.state;
}
