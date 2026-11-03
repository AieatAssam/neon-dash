import test from 'node:test';
import assert from 'node:assert/strict';
import { createGame, step } from '../core.ts';

test('orbs reward overlap once and never damage the runner', () => {
  const game = createGame({ speed: 0, obstacleStartX: 10000 });
  const r = game.state.runner;
  game.state.collectibles.push({ x: r.x + 12, y: r.y + 12, radius: 10 });
  step(game);
  assert.equal(game.state.stats.orbs, 1);
  assert.equal(game.state.status, 'running');
  step(game);
  assert.equal(game.state.stats.orbs, 1);
  assert.equal(game.state.collectibles.length, 0);
});

test('missing an orb has no penalty and phase does not restrict collection', () => {
  const game = createGame({ speed: 0, obstacleStartX: 10000 });
  game.state.collectibles.push({ x: 400, y: 100, radius: 10 });
  step(game, { togglePhase: true });
  assert.equal(game.state.stats.orbs, 0);
  assert.equal(game.state.status, 'running');
  game.state.collectibles.push({ x: 112, y: 288, radius: 10 });
  step(game);
  assert.equal(game.state.stats.orbs, 1);
});

test('seeded bonus paths are deterministic and separated from hazards', () => {
  const a = createGame({ seed: 71 });
  const b = createGame({ seed: 71 });
  assert.deepEqual(a.state.collectibles, b.state.collectibles);
  assert.ok(a.state.collectibles.length > 0);
  for (const orb of a.state.collectibles) {
    assert.ok(a.state.obstacles.every(o => Math.abs(o.x - orb.x) > 90));
    assert.ok(a.state.terrain.every(t => orb.x > t.x + t.width + 40 || orb.x < t.x - 40));
  }
});

test('missed orbs are culled during long runs', () => {
  const game = createGame();
  for (let i = 0; i < 10000; i++) {
    game.state.obstacles.length = 0;
    game.state.terrain.length = 0;
    step(game);
  }
  assert.equal(game.state.status, 'running');
  assert.ok(game.state.collectibles.length < 12);
  assert.ok(game.state.collectibles.every(o => o.x + o.radius >= game.state.distance - 100));
});
