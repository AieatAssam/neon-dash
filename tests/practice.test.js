import test from 'node:test';
import assert from 'node:assert/strict';
import { createGame, step } from '../core.ts';
import { createCheckpoint, restoreCheckpoint } from '../practice.ts';

test('checkpoint restores an independent complete simulation including Infinity', () => {
  const game = createGame({ seed: 71 });
  for (let i = 0; i < 150; i++) step(game);
  const expected = structuredClone(game);
  const checkpoint = createCheckpoint(game);
  assert.ok(checkpoint);
  game.state.stats.orbs = 200;
  game.state.obstacles.length = 0;
  const restored = restoreCheckpoint(checkpoint);
  assert.deepEqual(restored, expected);
  assert.equal(restored.config.finishX, Infinity);
  restored.state.obstacles.length = 0;
  assert.deepEqual(restoreCheckpoint(checkpoint), expected);
  assert.ok(Object.isFrozen(checkpoint));
});

test('restored generation remains identical after pruning and future random generation', () => {
  const game = createGame({ seed: 42 });
  const fly = g => { g.state.runner.y = -10000; g.state.runner.vy = 0; step(g); };
  for (let i = 0; i < 1400; i++) fly(game);
  const checkpoint = createCheckpoint(game);
  const restored = restoreCheckpoint(checkpoint);
  for (let i = 0; i < 2200; i++) { fly(game); fly(restored); }
  assert.deepEqual(restored, game);
});

test('restore releases stale input without changing physical state or earned checkpoint stats', () => {
  const game = createGame({ seed: 17 });
  step(game, { jump: true, togglePhase: true });
  game.accumulator = .002;
  game.pendingInput = { jump: true, togglePhase: true };
  game.state.jumpBuffer = .1;
  game.state.stats.orbs = 3;
  game.state.obstacles[0].cleared = true;
  game.state.collectibles.pop();
  const checkpoint = createCheckpoint(game);
  const restored = restoreCheckpoint(checkpoint);
  assert.deepEqual(restored.state.runner, game.state.runner);
  assert.deepEqual(restored.state.stats, game.state.stats);
  assert.deepEqual(restored.state.obstacles, game.state.obstacles);
  assert.deepEqual(restored.state.collectibles, game.state.collectibles);
  assert.equal(restored.state.phase, game.state.phase);
  assert.equal(restored.accumulator, 0);
  assert.deepEqual(restored.pendingInput, { jump: false, togglePhase: false });
  assert.equal(restored.state.jumpHeld, false);
  assert.equal(restored.state.jumpBuffer, 0);
});

test('failed or malformed captures and unknown handles safely return null', () => {
  for (const status of ['dead', 'won', 'paused']) {
    const game = createGame(); game.state.status = status;
    assert.equal(createCheckpoint(game), null);
  }
  for (const value of [null, undefined, {}, 12, { time: 1, distance: 1, seed: 1, mode: 'endless' }]) {
    assert.equal(restoreCheckpoint(value), null);
    assert.equal(createCheckpoint(value), null);
  }
  const game = createGame(); game.randomState = NaN;
  assert.equal(createCheckpoint(game), null);
  const checkpoint = createCheckpoint(createGame());
  assert.equal(restoreCheckpoint({ ...checkpoint }), null);
});
