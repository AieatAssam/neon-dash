import test from 'node:test';
import assert from 'node:assert/strict';
import { createGame, step, VERTICAL_SECTION_START_X, VERTICAL_WARP_SECONDS } from '../core.ts';
import { createCheckpoint, restoreCheckpoint } from '../practice.ts';

function enterVertical(game) {
  // Isolate the scene trigger from unrelated horizontal hazards in this focused integration fixture.
  game.generated = false;
  game.state.obstacles = [];
  game.state.terrain = [];
  game.state.runner.grounded = true;
  game.state.runner.y = game.config.groundY - game.state.runner.height;
  game.state.distance = VERTICAL_SECTION_START_X;
  const warpSteps = Math.ceil(VERTICAL_WARP_SECONDS / game.config.fixedStep) + 4;
  for (let i = 0; i < warpSteps; i++) step(game);
  assert.ok(game.verticalState, 'crossing the authored start position should enter the vertical section');
}

test('challenge enters the vertical course on fixed steps, routes color input, and resumes horizontally', () => {
  const game = createGame({ mode: 'challenge', seed: 17 });
  enterVertical(game);
  const startingDistance = game.state.distance;
  const startingPhase = game.state.phase;
  step(game, { togglePhase: true });
  assert.equal(game.verticalState.phase, 1 - startingPhase);
  assert.equal(game.state.phase, game.verticalState.phase);
  assert.equal(game.state.stats.switches, 1);
  assert.ok(game.state.distance > startingDistance);

  game.verticalState.y = game.verticalLength;
  step(game);
  assert.equal(game.verticalState, null);
  assert.equal(game.verticalComplete, true);
  const distanceAfterSection = game.state.distance;
  step(game);
  assert.ok(game.state.distance > distanceAfterSection, 'horizontal distance resumes after clearing the wall course');
});

test('an unswitched color-wall collision marks the run dead for the existing retry flow', () => {
  const game = createGame({ mode: 'challenge', seed: 5 });
  enterVertical(game);
  for (let i = 0; i < 1000 && game.state.status === 'running'; i++) step(game);
  assert.equal(game.state.status, 'dead');
  assert.equal(game.state.deathReason, 'obstacle');
  assert.ok(game.verticalState?.crashed);
});

test('practice checkpoints restore the in-progress vertical state and its seeded course', () => {
  const game = createGame({ mode: 'challenge', seed: 29 });
  enterVertical(game);
  step(game, { togglePhase: true });
  const checkpoint = createCheckpoint(game);
  assert.ok(checkpoint);
  const saved = structuredClone({ state: game.verticalState, obstacles: game.verticalObstacles });
  step(game, { togglePhase: true });
  const restored = restoreCheckpoint(checkpoint);
  assert.ok(restored);
  assert.deepEqual({ state: restored.verticalState, obstacles: restored.verticalObstacles }, saved);
});

test('scene changes wait for a full clear horizontal runway', () => {
  const game = createGame({ mode: 'challenge', seed: 17 });
  game.generated = false;
  game.state.obstacles = [];
  game.state.distance = VERTICAL_SECTION_START_X;
  const worldX = game.state.distance + game.state.runner.x;
  game.state.terrain = [{ kind: 'gap', x: worldX + 40, width: 280, height: 0 }];
  step(game);
  assert.equal(game.verticalState, null, 'entry waits before a gap in the runway');
  assert.equal(game.verticalWarp, null);
  game.state.terrain = [];
  game.state.status = 'running';
  game.state.deathReason = null;
  game.state.runner.y = game.config.groundY - game.state.runner.height;
  game.state.runner.vy = 0;
  game.state.runner.grounded = true;
  game.state.distance = VERTICAL_SECTION_START_X;
  const warpSteps = Math.ceil(VERTICAL_WARP_SECONDS / game.config.fixedStep) + 4;
  for (let i = 0; i < warpSteps; i++) step(game);
  assert.ok(game.verticalState);
  game.verticalState.y = game.verticalLength;
  game.state.obstacles = [{ x: game.state.distance + game.state.runner.x + 200, width: 22, height: 180, kind: 'gate', phase: 0 }];
  step(game);
  assert.ok(game.verticalState, 'exit waits before a gate in the runway');
  game.state.obstacles = [];
  step(game);
  assert.equal(game.verticalState, null);
  assert.equal(game.state.runner.grounded, true);
  assert.equal(game.state.runner.y + game.state.runner.height, game.config.groundY);
  assert.equal(game.state.runner.vy, 0);
});

test('the warp keeps the runner on the beat clock and ignores inputs', () => {
  const game = createGame({ mode: 'challenge', seed: 3 });
  game.generated = false;
  game.state.obstacles = [];
  game.state.terrain = [];
  game.state.distance = VERTICAL_SECTION_START_X;
  step(game);
  assert.notEqual(game.verticalWarp, null);
  const { jumps, switches } = game.state.stats;
  const before = game.state.distance;
  step(game, { jump: true, togglePhase: true });
  assert.equal(game.state.stats.jumps, jumps);
  assert.equal(game.state.stats.switches, switches);
  assert.ok(Math.abs(game.state.distance - before - game.state.speed * game.config.fixedStep) < 1e-9, 'no hidden slowdown');
});

test('a shield breaks one vertical gate row instead of ending the run', () => {
  const game = createGame({ mode: 'challenge', seed: 5 });
  enterVertical(game);
  game.state.powerUps = { shieldCharges: 1, shieldsUsed: 0 };
  const first = game.verticalObstacles[0];
  game.verticalState.y = first.y - 13;
  game.verticalState.x = first.x === 0 ? 30 : 390;
  game.verticalGraceUntilY = 0;
  for (let i = 0; i < 30; i++) step(game);
  assert.equal(game.state.status, 'running');
  assert.equal(game.state.powerUps.shieldCharges, 0);
  assert.deepEqual(game.verticalShattered, [0]);
});

test('the tutorial shield sits on the far wall of the runway', () => {
  const game = createGame({ mode: 'challenge', seed: 9 });
  const shield = game.verticalOrbs.find(orb => orb.shield);
  assert.ok(shield && shield.x > 210 && shield.y < game.verticalObstacles[0].y);
});
