/**
 * Deterministic, fixed-step runner simulation.
 * Coordinates are in world units; positive y points down.
 */

export const DEFAULT_CONFIG = Object.freeze({
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
export const CHALLENGE_RECIPES = Object.freeze([
  Object.freeze([null]), Object.freeze([0]), Object.freeze([1]),
  Object.freeze([null, null]), Object.freeze([0, 1]),
  Object.freeze([1, null]), Object.freeze([null, 0, 1]),
]);
export const LEVEL_SECTIONS = Object.freeze([]);

function random(game) {
  game.randomState = (game.randomState + 0x6D2B79F5) >>> 0;
  let n = game.randomState;
  n = Math.imul(n ^ n >>> 15, n | 1);
  n ^= n + Math.imul(n ^ n >>> 7, n | 61);
  return ((n ^ n >>> 14) >>> 0) / 4294967296;
}

function extendCourse(game) {
  const s = game.state;
  while (game.nextCluster < s.distance + 2400) {
    const tier = Math.min(6, 2 + Math.floor(s.time / 15));
    const recipe = CHALLENGE_RECIPES[Math.floor(random(game) * (tier + 1))];
    const height = 34 + Math.floor(random(game) * 4) * 4;
    recipe.forEach((phase, i) => s.obstacles.push({
      x: game.nextCluster + i * 28, width: 26, height, phase,
    }));
    game.nextCluster += 360 + Math.floor(random(game) * 100);
  }
  s.obstacles = s.obstacles.filter(o => o.x + o.width > s.distance - 100);
}

function overlaps(a, b) {
  return a.x < b.x + b.width && a.x + a.width > b.x &&
    a.y < b.y + b.height && a.y + a.height > b.y;
}

export function createGame(overrides = {}) {
  const layoutOverride = ["obstacleStartX", "obstacleGap", "obstacleWidth", "obstacleHeight"].some(key => Object.hasOwn(overrides, key));
  const config = { ...DEFAULT_CONFIG, ...(layoutOverride ? { finishX: 9000 } : {}), ...overrides };
  if (!(config.fixedStep > 0) || !(config.speed >= 0) || !(config.finishX > config.runnerX)) {
    throw new RangeError("Invalid simulation configuration");
  }
  const obstacleCount = Math.max(0, Math.ceil((config.finishX - config.obstacleStartX) / config.obstacleGap));
  const customLayout = ["obstacleStartX", "obstacleGap", "obstacleWidth", "obstacleHeight", "finishX"].some(key => Object.hasOwn(overrides, key));
  const obstacles = customLayout ? Array.from({ length: obstacleCount }, (_, i) => ({
    x: config.obstacleStartX + i * config.obstacleGap,
    width: config.obstacleWidth,
    height: config.obstacleHeight,
    phase: i % 2,
  })) : [];

  const game = {
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
      status: "running",
      deathReason: null,
      jumpHeld: false,
    },
  };
  if (game.endless) extendCourse(game);
  return game;
}

/** Advance exactly one fixed simulation step. Inputs are edge-triggered for this step. */
export function step(game, input = {}) {
  const s = game.state;
  const c = game.config;
  if (s.status !== "running") return s;

  if (input.togglePhase) { s.phase = 1 - s.phase; s.stats.switches++; }
  if (input.jump && !s.jumpHeld && s.runner.grounded) {
    s.stats.jumps++;
    s.runner.vy = c.jumpVelocity;
    s.runner.grounded = false;
  }
  s.jumpHeld = Boolean(input.jump);

  const dt = c.fixedStep;
  s.time += dt;
  s.speed = game.endless ? Math.min(c.maxSpeed, c.speed + s.time * 1.2) : c.speed;
  s.level = 1 + Math.floor(s.time / 20);
  s.distance += s.speed * dt;
  if (game.endless) extendCourse(game);
  s.runner.vy += c.gravity * dt;
  s.runner.y += s.runner.vy * dt;
  const floor = c.groundY - s.runner.height;
  if (s.runner.y >= floor) {
    s.runner.y = floor;
    s.runner.vy = 0;
    s.runner.grounded = true;
  }

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
    if (overlaps(runnerBox, slice)) {
      s.status = "dead";
      s.deathReason = "obstacle";
      return s;
    }
  }
  if (s.distance + s.runner.x >= c.finishX) s.status = "won";
  return s;
}

/** Advance elapsed wall time in deterministic fixed-size increments. */
export function advance(game, elapsed, input = {}) {
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
