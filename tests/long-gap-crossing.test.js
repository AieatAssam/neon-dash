import test from 'node:test';
import assert from 'node:assert/strict';
import { createGame, step } from '../core.ts';
import { longGapCrossingAt } from '../long-gap-crossing.ts';

function runCrossing(speed, { ramp = false, removePlatform } = {}) {
  const game = createGame({ speed, maxSpeed: ramp ? 340 : speed, obstacleStartX: 100000, finishX: 100000 });
  // Exercise the production ramp without unrelated generated course hazards.
  game.generated = ramp;
  game.nextCluster = 100000;
  const base = 360;
  game.state.terrain = longGapCrossingAt(base).filter(t => t.x !== base + removePlatform);
  const takeoffs = [];
  const landings = new Set();
  for (let i = 0; i < 120 * 10 && game.state.status === 'running'; i++) {
    const x = game.state.distance + game.state.runner.x - base;
    if (x > 1100 && game.state.runner.grounded) break;
    const grounded = game.state.runner.grounded;
    const bottom = game.state.runner.y + game.state.runner.height;
    if (grounded) landings.add(game.config.groundY - bottom);
    const jump = grounded && ((x >= 90 && x < 132) || [332, 630, 930].some(edge => x >= edge - 40 && x < edge));
    const before = game.state.stats.jumps;
    step(game, { jump });
    if (game.state.stats.jumps > before) takeoffs.push({ x, height: game.config.groundY - bottom });
  }
  return { game, takeoffs, landings, x: game.state.distance + game.state.runner.x - base };
}

test('crossing lands on both stepping stones and exits at every target speed', () => {
  for (const speed of [240, 260, 280, 300, 320, 340]) {
    const result = runCrossing(speed);
    assert.equal(result.game.state.status, 'running', `speed ${speed}: ${result.game.state.deathReason} at ${result.x}`);
    assert.ok(result.x > 1100, `exited crossing at ${speed}`);
    assert.equal(result.takeoffs.length, 4, `entry plus three platform takeoffs at ${speed}`);
    assert.deepEqual(result.takeoffs.map(t => t.height), [0, 18, 28, 18]);
  }
});

test('crossing remains solvable with the production speed ramp', () => {
  const result = runCrossing(240, { ramp: true });
  assert.equal(result.game.state.status, 'running');
  assert.ok(result.x > 1100);
  assert.deepEqual(result.takeoffs.map(t => t.height), [0, 18, 28, 18]);
});

test('removing either stepping stone makes the same crossing fall into the void', () => {
  for (const speed of [240, 280, 340]) {
    for (const removePlatform of [460, 760]) {
      const result = runCrossing(speed, { removePlatform });
      assert.equal(result.game.state.deathReason, 'fall', `missing ${removePlatform} at ${speed}`);
    }
  }
});
