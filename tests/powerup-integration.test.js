import test from 'node:test';
import assert from 'node:assert/strict';
import { createGame, step } from '../core.ts';
import { collectShield } from '../powerups.ts';
import { createCheckpoint, restoreCheckpoint } from '../practice.ts';

test('a charged shield absorbs an entire contiguous obstacle group exactly once', () => {
  const game = createGame({ speed: 0, obstacleStartX: 10000 });
  game.state.powerUps = collectShield(game.state.powerUps);
  game.state.obstacles.push(
    { x: 100, width: 26, height: 42, phase: 0, groupId: 900 },
    { x: 128, width: 26, height: 42, phase: 0, groupId: 900 },
  );

  step(game);
  assert.equal(game.state.status, 'running');
  assert.equal(game.state.powerUps.shieldCharges, 0);
  assert.equal(game.state.powerUps.shieldsUsed, 1);
  assert.ok(game.state.obstacles.every(obstacle => obstacle.shielded));
  step(game);
  assert.equal(game.state.status, 'running');
  assert.equal(game.state.powerUps.shieldsUsed, 1);
});

test('shield pickups are collected without affecting orb counts', () => {
  const game = createGame({ speed: 0, obstacleStartX: 10000 });
  const runner = game.state.runner;
  game.state.shieldPickups.push({ x: runner.x + runner.width / 2, y: runner.y + runner.height / 2, radius: 12 });
  step(game);
  assert.equal(game.state.powerUps.shieldCharges, 1);
  assert.equal(game.state.stats.orbs, 0);
  assert.equal(game.state.shieldPickups.length, 0);
});

test('the deterministic generated course places shield pickups on a repeatable schedule', () => {
  const a = createGame({ seed: 451 });
  const b = createGame({ seed: 451 });
  for (let i = 0; i < 3600 && a.state.shieldPickups.length === 0; i++) {
    a.state.obstacles.length = 0;
    a.state.terrain.length = 0;
    b.state.obstacles.length = 0;
    b.state.terrain.length = 0;
    step(a);
    step(b);
  }
  assert.ok(a.state.shieldPickups.length > 0);
  assert.deepEqual(a.state.shieldPickups, b.state.shieldPickups);
  assert.deepEqual(a.state.obstacles, b.state.obstacles);
});

test('shield cannot prevent a fall', () => {
  const game = createGame({ speed: 0, obstacleStartX: 10000 });
  game.state.powerUps = collectShield(game.state.powerUps);
  game.state.runner.y = game.config.groundY + 101;
  step(game);
  assert.equal(game.state.status, 'dead');
  assert.equal(game.state.deathReason, 'fall');
  assert.equal(game.state.powerUps.shieldCharges, 1);
  assert.equal(game.state.powerUps.shieldsUsed, 0);
});

test('shield cannot prevent platform side impacts', () => {
  const game = createGame({ speed: 0, obstacleStartX: 10000 });
  game.state.powerUps = collectShield(game.state.powerUps);
  game.state.terrain.push({ kind: 'platform', x: game.config.runnerX, width: 80, height: 28 });
  game.state.runner.y = game.config.groundY - 20;
  step(game);
  assert.equal(game.state.status, 'dead');
  assert.equal(game.state.deathReason, 'platform');
  assert.equal(game.state.powerUps.shieldCharges, 1);
  assert.equal(game.state.powerUps.shieldsUsed, 0);
});

test('practice checkpoints preserve the shield charge and absorbed groups', () => {
  const game = createGame({ speed: 0, obstacleStartX: 10000 });
  game.state.powerUps = collectShield(game.state.powerUps);
  game.state.obstacles.push({ x: 300, width: 26, height: 42, phase: 0, groupId: 123 });
  game.state.obstacles[0].shielded = true;
  const checkpoint = createCheckpoint(game);
  const restored = restoreCheckpoint(checkpoint);
  assert.deepEqual(restored.state.powerUps, game.state.powerUps);
  assert.deepEqual(restored.state.obstacles, game.state.obstacles);
});
