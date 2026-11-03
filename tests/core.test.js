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

test("endless course is seeded and varies between seeds", () => {
  assert.deepEqual(createGame({ seed: 7 }).state.obstacles, createGame({ seed: 7 }).state.obstacles);
  assert.notDeepEqual(createGame({ seed: 7 }).state.obstacles, createGame({ seed: 8 }).state.obstacles);
  assert.ok(createGame().state.obstacles.some(o => o.phase === null));
});

test("endless ramp is capped and obstacle memory stays bounded", () => {
  const game = createGame({ seed: 7 });
  for (let i = 0; i < 120 * 240; i++) {
    game.state.runner.y = -10000;
    game.state.runner.vy = 0;
    step(game);
  }
  assert.equal(game.state.status, "running");
  assert.equal(game.state.speed, 340);
  assert.ok(game.state.level > 1);
  assert.ok(game.state.obstacles.length < 35);
  assert.ok(game.state.stats.cleared > 100);
});

test("neutral spikes cannot be bypassed with phase", () => {
  for (const phase of [0, 1]) {
    const game = createGame({ speed: 0, obstacleStartX: 0, runnerX: 0, finishX: 100 });
    game.state.obstacles[0].phase = null;
    game.state.phase = phase;
    step(game);
    assert.equal(game.state.status, "dead");
  }
});

test("generated recipes are jumpable at every ramp speed with deliberate timing", () => {
  for (const speed of [240, 280, 340]) {
    const game = createGame({ seed: 17 });
    // Freeze ramp at each tested speed while retaining generation.
    game.config.speed = speed;
    game.config.maxSpeed = speed;
    for (let i = 0; i < 120 * 100 && game.state.status === "running"; i++) {
      const s = game.state;
      const x = s.distance + s.runner.x;
      const next = s.obstacles.find(o => o.x + o.width > x - 3);
      const jump = Boolean(next && next.x - x < speed * .19 && s.runner.grounded);
      step(game, { jump });
    }
    assert.equal(game.state.status, "running", `speed ${speed}, distance ${game.state.distance}`);
    assert.ok(game.state.stats.jumps > 30);
  }
});
