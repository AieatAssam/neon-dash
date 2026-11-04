import { courseInput } from './course-solver.js';
import test from "node:test";
import assert from "node:assert/strict";
import { advance, createGame, step } from "../core.ts";

test("fixed-step advance matches repeated single steps", () => {
  const a = createGame({ speed: 1000, obstacleStartX: 10000, finishX: 100000 });
  const b = createGame({ speed: 1000, obstacleStartX: 10000, finishX: 100000 });
  advance(a, 1, { jump: true });
  for (let i = 0; i < 120; i++) step(b, { jump: true });
  assert.deepEqual(a.state, b.state);
});

test("holding jump repeats on landing, releasing lets the runner settle", () => {
  const game = createGame({ speed: 0, obstacleStartX: 10000 });
  for (let i = 0; i < 180; i++) step(game, { jump: true });
  assert.ok(game.state.stats.jumps >= 3);
  assert.equal(game.state.runner.grounded, false);
  for (let i = 0; i < 120; i++) step(game);
  assert.equal(game.state.runner.grounded, true);
  assert.equal(game.state.runner.y, game.config.groundY - game.state.runner.height);
});

test("held jump behaves identically across render frame sizes", () => {
  const a = createGame({ speed: 0, obstacleStartX: 10000 });
  const b = createGame({ speed: 0, obstacleStartX: 10000 });
  advance(a, 2, { jump: true });
  for (let i = 0; i < 120; i++) advance(b, 1 / 60, { jump: true });
  assert.deepEqual(a.state, b.state);
  assert.ok(a.state.stats.jumps >= 3);
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

test("phase toggle is consumed once when advance simulates multiple steps", () => {
  const game = createGame({ speed: 0, obstacleStartX: 10000 });
  advance(game, game.config.fixedStep * 5, { togglePhase: true });
  assert.equal(game.state.phase, 1);
  assert.equal(game.state.stats.switches, 1);
});

test('horizontal jump physics are identical in both colors', () => {
  const cyan = createGame({ speed: 0, obstacleStartX: 10000, finishX: 100000 });
  const violet = createGame({ speed: 0, obstacleStartX: 10000, finishX: 100000 });
  violet.state.phase = 1;
  for (let i = 0; i < 120; i++) {
    step(cyan, { jump: i === 0 });
    step(violet, { jump: i === 0 });
    assert.deepEqual(cyan.state.runner, violet.state.runner);
  }
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
  assert.ok(createGame().state.obstacles.some(o => o.kind === 'gate'));
});

test("endless ramp is capped and obstacle memory stays bounded", () => {
  const game = createGame({ seed: 7 });
  const obstacles = game.state.obstacles;
  for (let i = 0; i < 120 * 240; i++) {
    game.state.runner.y = -10000;
    game.state.runner.vy = 0;
    step(game);
  }
  assert.equal(game.state.status, "running");
  assert.equal(game.state.speed, 340);
  assert.ok(game.state.level > 1);
  assert.ok(game.state.obstacles.length < 35);
  assert.equal(game.state.obstacles, obstacles, "course pruning should retain the live array");
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

test("generated recipes remain safe with deliberate jumps and gate switches", () => {
  for (const speed of [240, 280, 340]) {
    const game = createGame({ seed: 17 });
    // Freeze ramp at each tested speed while retaining generation.
    game.config.speed = speed;
    game.config.maxSpeed = speed;
    const terrainKinds = new Set();
    for (let i = 0; i < 120 * 100 && game.state.status === "running"; i++) {
      const s = game.state;
      for (const terrain of s.terrain) terrainKinds.add(terrain.kind);
      step(game, courseInput(game));
    }
    assert.equal(game.state.status, "running", `speed ${speed}, distance ${game.state.distance}`);
    assert.ok(game.state.stats.jumps > 30);
    assert.deepEqual([...terrainKinds].sort(), ['gap', 'platform']);
    assert.ok(game.state.terrain.length < 15);
  }
});

test('phase gates require switching and cannot be jumped', () => {
  for (const jumping of [false, true]) {
    const game = createGame({ speed: 240, obstacleStartX: 260, finishX: 700 });
    game.state.obstacles = [{ x: 260, width: 22, height: 180, phase: 0, kind: 'gate' }];
    for (let i = 0; i < 300 && game.state.status === 'running'; i++) {
      step(game, { jump: jumping && game.state.runner.grounded });
    }
    assert.equal(game.state.status, 'dead');
  }
  const game = createGame({ speed: 240, obstacleStartX: 260, finishX: 700 });
  game.state.obstacles = [{ x: 260, width: 22, height: 180, phase: 0, kind: 'gate' }];
  step(game, { togglePhase: true });
  for (let i = 0; i < 400 && game.state.status === 'running'; i++) step(game);
  assert.equal(game.state.status, 'won');
});

test('fast runner cannot tunnel through a narrow obstacle between fixed steps', () => {
  const game = createGame({ speed: 7000, runnerX: 0, obstacleStartX: 84, obstacleGap: 1000, finishX: 1000 });
  step(game);
  assert.equal(game.state.status, 'running');
  step(game);
  assert.equal(game.state.status, 'dead');
  assert.equal(game.state.deathReason, 'obstacle');
});

test('jump pressed shortly before landing is buffered', () => {
  const game = createGame({ speed: 0, obstacleStartX: 10000 });
  game.state.runner.y -= 2;
  game.state.runner.vy = 100;
  game.state.runner.grounded = false;
  step(game, { jump: true });
  for (let i = 0; i < 5; i++) step(game);
  assert.equal(game.state.runner.grounded, false);
  assert.equal(game.state.stats.jumps, 1);
  assert.ok(game.state.runner.vy < 0);
});


test('endless generation starts with the gate tutorial and spaces later gates', () => {
  const game = createGame({ seed: 17, speed: 240, maxSpeed: 240 });
  const openingGate = game.state.obstacles.find(o => o.kind === 'gate');
  assert.ok(openingGate);
  assert.ok(openingGate.phase === 0 || openingGate.phase === 1);
  assert.ok(Math.abs((openingGate.x - game.config.runnerX) / game.config.speed - 8 * (60 / 115)) < .01);
  assert.ok(['gap', 'platform'].includes(game.state.terrain[0].kind));
  assert.ok(Math.abs((game.state.terrain[0].x - game.config.runnerX) / game.config.speed - 14 * (60 / 115)) < .01);
  let foundGate = false;
  for (let i = 0; i < 120 * 50; i++) {
    game.state.runner.y = -10000;
    game.state.runner.vy = 0;
    step(game);
    const gate = game.state.obstacles.find(o => o.kind === 'gate');
    if (gate && gate !== openingGate) {
      foundGate = true;
      assert.ok(game.state.obstacles.every(o => o === gate || Math.abs(o.x - gate.x) >= 278));
    }
  }
  assert.ok(foundGate);
});

test('gaps remove floor and require a timed jump', () => {
  for (const jumping of [false, true]) {
    const game = createGame({ speed: 240, obstacleStartX: 10000, finishX: 700 });
    game.state.terrain = [{ kind: 'gap', x: 300, width: 90, height: 0 }];
    for (let i = 0; i < 500 && game.state.status === 'running'; i++) {
      const x = game.state.distance + game.state.runner.x;
      step(game, { jump: jumping && x > 255 && x < 260 });
    }
    assert.equal(game.state.status, jumping ? 'won' : 'dead');
    if (!jumping) assert.equal(game.state.deathReason, 'fall');
  }
});

test('platforms support landings and punish side impacts', () => {
  const game = createGame({ speed: 240, obstacleStartX: 10000, finishX: 700 });
  game.state.terrain = [{ kind: 'platform', x: 300, width: 110, height: 28 }];
  for (let i = 0; i < 200 && game.state.status === 'running'; i++) step(game);
  assert.equal(game.state.deathReason, 'platform');
  const landing = createGame({ speed: 0, obstacleStartX: 10000 });
  landing.state.terrain = [{ kind: 'platform', x: 90, width: 110, height: 28 }];
  landing.state.runner.y = 240;
  landing.state.runner.vy = 100;
  landing.state.runner.grounded = false;
  for (let i = 0; i < 30; i++) step(landing);
  assert.equal(landing.state.status, 'running');
  assert.equal(landing.state.runner.y, 248);
  assert.equal(landing.state.runner.grounded, true);
});

test('long challenge uses finite seeded generation with a clear finish runway', () => {
  const a = createGame({ mode: 'challenge', seed: 17 });
  const b = createGame({ mode: 'challenge', seed: 17 });
  assert.equal(a.endless, false);
  assert.equal(a.config.finishX, 18000);
  assert.deepEqual(a.state, b.state);
  assert.notDeepEqual(a.state.obstacles, createGame({ mode: 'challenge', seed: 18 }).state.obstacles);
  // This assertion isolates the finite horizontal generator and finish runway;
  // the authored vertical set piece has its own fixed-step integration tests.
  a.verticalComplete = b.verticalComplete = true;
  let maxLive = 0;
  for (let i = 0; i < 120 * 80 && a.state.status === 'running'; i++) {
    a.state.runner.y = b.state.runner.y = -10000;
    a.state.runner.vy = b.state.runner.vy = 0;
    step(a); step(b);
    maxLive = Math.max(maxLive, a.state.obstacles.length);
    for (const item of [...a.state.obstacles, ...a.state.terrain]) {
      assert.ok(item.x + item.width <= a.config.finishX - 200);
    }
    assert.ok(a.state.collectibles.every(o => o.x + o.radius < a.config.finishX));
  }
  assert.equal(a.state.status, 'won');
  assert.deepEqual(a.state, b.state);
  assert.ok(a.state.time > 55 && a.state.time < 75);
  assert.ok(maxLive < 35);
  const time = a.state.time;
  step(a);
  assert.equal(a.state.time, time);
});

test('seeded challenges can be completed with timed jumps and phase switches', () => {
  for (const seed of [1, 7, 17, 42, 12345]) {
    const game = createGame({ mode: 'challenge', seed });
    for (let i = 0; i < 120 * 80 && game.state.status === 'running'; i++) {
      step(game, courseInput(game));
    }
    assert.equal(game.state.status, 'won', `seed ${seed}, distance ${game.state.distance}`);
    assert.ok(game.state.stats.jumps > 10);
  }
});

test('challenge keeps endless opening recipes and rejects an infinite finish', () => {
  assert.deepEqual(createGame({ mode: 'challenge', seed: 7 }).state.obstacles,
    createGame({ seed: 7 }).state.obstacles);
  assert.throws(() => createGame({ mode: 'challenge', finishX: Infinity }), RangeError);
  const legacy = createGame({ finishX: 1000 });
  assert.equal(legacy.generated, false);
  assert.equal(legacy.endless, false);
  assert.equal(legacy.state.obstacles[0].x, legacy.config.obstacleStartX);
});

test("challenge progress measures distance from the starting position to the finish", async () => {
  const { challengeProgress } = await import("../core.ts");
  assert.equal(challengeProgress(0, 100, 9000), 0);
  assert.equal(challengeProgress(4450, 100, 9000), 50);
  assert.equal(challengeProgress(8900, 100, 9000), 100);
  assert.equal(challengeProgress(10000, 100, 9000), 100);
});

test('jump remains available briefly after running off a gap edge', () => {
  const game = createGame({ speed: 240, obstacleStartX: 10000, finishX: 1000 });
  game.state.terrain = [{ kind: 'gap', x: 114, width: 150, height: 0 }];
  step(game);
  step(game);
  assert.equal(game.state.runner.grounded, false);
  for (let i = 0; i < 4; i++) step(game);
  step(game, { jump: true });
  assert.equal(game.state.stats.jumps, 1);
  assert.ok(game.state.runner.vy < 0);
});

test('edge jump forgiveness expires and does not grant a second airborne jump', () => {
  const expired = createGame({ speed: 240, obstacleStartX: 10000, finishX: 1000 });
  expired.state.terrain = [{ kind: 'gap', x: 114, width: 400, height: 0 }];
  for (let i = 0; i < 15; i++) step(expired);
  step(expired, { jump: true });
  assert.equal(expired.state.stats.jumps, 0);
  assert.ok(expired.state.runner.vy > 0);

  const jumping = createGame({ speed: 0, obstacleStartX: 10000 });
  step(jumping, { jump: true });
  step(jumping);
  step(jumping, { jump: true });
  assert.equal(jumping.state.stats.jumps, 1);
});

test('platform edge grace allows one late jump without refreshing in midair', () => {
  const game = createGame({ speed: 240, obstacleStartX: 10000, finishX: 1000 });
  game.state.terrain = [{ kind: 'platform', x: 80, width: 46, height: 28 }];
  game.state.runner.y = game.config.groundY - 28 - game.state.runner.height;
  for (let i = 0; i < 15; i++) step(game);
  assert.equal(game.state.runner.grounded, false);
  step(game, { jump: true });
  assert.equal(game.state.stats.jumps, 1);
  assert.ok(game.state.runner.vy < 0);
  step(game);
  step(game, { jump: true });
  assert.equal(game.state.stats.jumps, 1);
});
