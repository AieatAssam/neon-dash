import test from "node:test";
import assert from "node:assert/strict";
import { advance, createGame, step } from "../core.js";

test("fixed-step advance matches repeated single steps", () => {
  const a = createGame({ speed: 1000, obstacleStartX: 10000, finishX: 100000 });
  const b = createGame({ speed: 1000, obstacleStartX: 10000, finishX: 100000 });
  advance(a, 1, { jump: true });
  for (let i = 0; i < 120; i++) step(b, { jump: i === 0 });
  assert.deepEqual(a.state, b.state);
});

test("jump is edge-triggered by grounded state and returns to the floor", () => {
  const game = createGame({ speed: 0, obstacleStartX: 10000 });
  step(game, { jump: true });
  assert.equal(game.state.runner.grounded, false);
  assert.ok(game.state.runner.y < game.config.groundY - game.state.runner.height);
  const firstFrame = game.state.runner.y;
  for (let i = 0; i < 180; i++) step(game, { jump: true });
  assert.ok(firstFrame < game.config.groundY - game.config.runnerHeight);
  assert.equal(game.state.runner.grounded, true);
  assert.equal(game.state.runner.y, game.config.groundY - game.state.runner.height);
});

test("phase toggle makes mismatched obstacles harmless and matching obstacles lethal", () => {
  const game = createGame({ runnerX: 0, speed: 0, obstacleStartX: 0, obstacleGap: 1000, finishX: 100 });
  assert.equal(game.state.obstacles[0].phase, 0);
  step(game);
  assert.equal(game.state.status, "dead");

  const switched = createGame({ runnerX: 0, speed: 0, obstacleStartX: 0, obstacleGap: 1000, finishX: 100 });
  step(switched, { togglePhase: true });
  assert.equal(switched.state.phase, 1);
  assert.equal(switched.state.status, "running");
  step(switched, { togglePhase: true });
  assert.equal(switched.state.status, "dead");
  assert.equal(switched.state.deathReason, "obstacle");
});

test("runner wins after crossing finish and terminal states do not advance", () => {
  const game = createGame({ runnerX: 0, speed: 120, obstacleStartX: 10000, finishX: 1 });
  step(game);
  assert.equal(game.state.status, "won");
  const time = game.state.time;
  step(game, { jump: true, togglePhase: true });
  assert.equal(game.state.time, time);
  assert.equal(game.state.phase, 0);
});

test("invalid elapsed duration is rejected", () => {
  assert.throws(() => advance(createGame(), -1), RangeError);
});

test("advance preserves fractional elapsed time between calls", () => {
  const game = createGame({ speed: 120, obstacleStartX: 10000 });
  advance(game, game.config.fixedStep / 2);
  assert.equal(game.state.distance, 0);
  advance(game, game.config.fixedStep / 2);
  assert.equal(game.state.distance, 1);
});

test("advance retains an input until a simulation step is available", () => {
  const game = createGame({ speed: 0, obstacleStartX: 10000 });
  advance(game, game.config.fixedStep / 2, { jump: true, togglePhase: true });
  advance(game, game.config.fixedStep / 2);
  assert.equal(game.state.phase, 1);
  assert.equal(game.state.runner.grounded, false);
});

test("spike collision respects the triangular tip instead of its empty corners", () => {
  const game = createGame({ runnerX: 0, runnerWidth: 4, runnerHeight: 4, groundY: 100, gravity: 0, speed: 0, obstacleStartX: 3, obstacleWidth: 28, obstacleHeight: 42, obstacleGap: 1000, finishX: 100 });
  game.state.runner.y = 58;
  game.state.runner.grounded = false;
  step(game);
  assert.equal(game.state.status, "running");
});

test("authored circuit grows through three varied sections", () => {
  const game = createGame();
  assert.ok(game.config.finishX / game.config.speed >= 30);
  const spikes = game.state.obstacles;
  assert.ok(spikes.length >= 30);
  assert.ok(new Set(spikes.map(s => s.height)).size >= 3);
  assert.ok(spikes.some((s, i) => i && s.x - spikes[i - 1].x < 50));
});

test("authored circuit can be completed with deliberate jumps and phase changes", () => {
  const game = createGame();
  let jumps = 0;
  let switches = 0;
  let lastSwitch = 0;
  for (let frame = 0; frame < 6000 && game.state.status === "running"; frame++) {
    const s = game.state;
    const runnerX = s.distance + s.runner.x;
    const next = s.obstacles.find(o => o.x + o.width > runnerX && o.phase === s.phase);
    const jump = Boolean(next && next.x - runnerX < 45 && s.runner.grounded);
    // Change phase in the open runway between each musical phrase.
    const runway = s.obstacles.every(o => o.x + o.width < runnerX - 30 || o.x > runnerX + 200);
    const togglePhase = frame - lastSwitch >= 400 && runway;
    if (jump) jumps++;
    if (togglePhase) { switches++; lastSwitch = frame; }
    step(game, { jump, togglePhase });
  }
  assert.equal(game.state.status, "won");
  assert.ok(jumps >= 10);
  assert.ok(switches >= 5);
});
