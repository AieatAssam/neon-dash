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
  finishX: 9000,
  fixedStep: 1 / 120,
});

// Each phrase has a readable runway, then a compact jump pattern. The final
// section mixes phases within clusters so staying in one color still needs jumps.
export const LEVEL_SECTIONS = Object.freeze([
  { name: "FIND THE BEAT", start: 0, end: 2800 },
  { name: "CROSS THE SIGNAL", start: 2800, end: 5800 },
  { name: "NEON OVERDRIVE", start: 5800, end: 9000 },
]);

function authoredObstacles() {
  const phrases = [
    [560, [0], 34], [960, [1], 34], [1360, [0, 0], 38],
    [1800, [1], 42], [2200, [0, 1], 38], [2600, [1, 1], 42],
    [3100, [0, 1], 44], [3500, [1, 0], 42], [3900, [0, 0, 1], 38],
    [4340, [1, 1], 50], [4780, [0, 1, 0], 42], [5260, [1, 0], 46],
    [6000, [0, 1, 0], 46], [6460, [1, 0, 1], 42],
    [6920, [0, 0, 1], 50], [7380, [1, 0, 1], 46],
    [7840, [0, 1, 0], 50], [8300, [1, 0, 1], 46],
  ];
  return phrases.flatMap(([x, phases, height]) => phases.map((phase, i) => ({
    x: x + i * 30, width: 28, height, phase,
  })));
}

function overlaps(a, b) {
  return a.x < b.x + b.width && a.x + a.width > b.x &&
    a.y < b.y + b.height && a.y + a.height > b.y;
}

export function createGame(overrides = {}) {
  const config = { ...DEFAULT_CONFIG, ...overrides };
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
  })) : authoredObstacles();

  return {
    config,
    accumulator: 0,
    pendingInput: { jump: false, togglePhase: false },
    state: {
      time: 0,
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
}

/** Advance exactly one fixed simulation step. Inputs are edge-triggered for this step. */
export function step(game, input = {}) {
  const s = game.state;
  const c = game.config;
  if (s.status !== "running") return s;

  if (input.togglePhase) s.phase = 1 - s.phase;
  if (input.jump && !s.jumpHeld && s.runner.grounded) {
    s.runner.vy = c.jumpVelocity;
    s.runner.grounded = false;
  }
  s.jumpHeld = Boolean(input.jump);

  const dt = c.fixedStep;
  s.time += dt;
  s.distance += c.speed * dt;
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
    if (obstacle.phase !== s.phase) continue;
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
