import test from 'node:test';
import assert from 'node:assert/strict';
import { createGame, step } from '../core.ts';
import { LONG_GAP_CROSSINGS, longGapCollectiblesAt, longGapCrossingAt } from '../long-gap-crossing.ts';

function runCrossing(speed, { ramp = false, removePlatform, variant = 0 } = {}) {
  const game = createGame({ speed, maxSpeed: ramp ? 340 : speed, obstacleStartX: 100000, finishX: 100000 });
  // Exercise the production ramp without unrelated generated course hazards.
  game.generated = ramp;
  game.nextCluster = 100000;
  const base = 360;
  const layout = longGapCrossingAt(base, variant);
  game.state.terrain = layout.filter(t => t.x !== base + removePlatform);
  game.state.collectibles.push(...longGapCollectiblesAt(base, game.config.groundY, variant));
  const gap = layout.find(t => t.kind === 'gap');
  const platforms = layout.filter(t => t.kind === 'platform');
  const takeoffs = [];
  const landings = new Set();
  for (let i = 0; i < 120 * 10 && game.state.status === 'running'; i++) {
    const x = game.state.distance + game.state.runner.x - base;
    if (x > gap.x + gap.width - base + 100 && game.state.runner.grounded) break;
    const grounded = game.state.runner.grounded;
    const bottom = game.state.runner.y + game.state.runner.height;
    if (grounded) landings.add(game.config.groundY - bottom);
    const takeoffEdges = [gap.x - base, ...platforms.slice(1).map(p => p.x + p.width - base)];
    const jump = grounded && ((x >= 90 && x < 132) || takeoffEdges.some(edge => x >= edge - 40 && x < edge));
    const before = game.state.stats.jumps;
    step(game, { jump });
    if (game.state.stats.jumps > before) takeoffs.push({ x, height: game.config.groundY - bottom });
  }
  return { game, takeoffs, landings, x: game.state.distance + game.state.runner.x - base };
}

test('crossing layouts land on both stepping stones and exit at every target speed', () => {
  for (let variant = 0; variant < LONG_GAP_CROSSINGS.length; variant++) {
    for (const speed of [240, 260, 280, 300, 320, 340]) {
      const result = runCrossing(speed, { variant });
      const heights = LONG_GAP_CROSSINGS[variant].filter(t => t.kind === 'platform').map(t => t.height);
      const gapEnd = LONG_GAP_CROSSINGS[variant].find(t => t.kind === 'gap').x + LONG_GAP_CROSSINGS[variant].find(t => t.kind === 'gap').width;
      assert.equal(result.game.state.status, 'running', `variant ${variant}, speed ${speed}: ${result.game.state.deathReason} at ${result.x}`);
      assert.ok(result.x > gapEnd, `exited crossing at ${speed}`);
      assert.equal(result.takeoffs.length, 4, `entry plus three platform takeoffs at ${speed}`);
      assert.deepEqual(result.takeoffs.map(t => t.height), [0, ...heights]);
    }
  }
});

test('crossing remains solvable with the production speed ramp', () => {
  const result = runCrossing(240, { ramp: true });
  assert.equal(result.game.state.status, 'running');
  assert.ok(result.x > 1100);
  assert.deepEqual(result.takeoffs.map(t => t.height), [0, 18, 28, 18]);
});

test('removing either stepping stone makes the same crossing fall into the void', () => {
  for (let variant = 0; variant < LONG_GAP_CROSSINGS.length; variant++) {
    const stones = LONG_GAP_CROSSINGS[variant].filter(t => t.kind === 'platform').slice(1);
    for (const speed of [240, 280, 340]) {
      for (const stone of stones) {
        const result = runCrossing(speed, { variant, removePlatform: stone.x });
        assert.equal(result.game.state.deathReason, 'fall', `variant ${variant}, missing ${stone.x} at ${speed}`);
      }
    }
  }
});

test('stepping-stone orbs are collectible on the required jump arcs', () => {
  for (let variant = 0; variant < LONG_GAP_CROSSINGS.length; variant++) {
    const result = runCrossing(280, { variant });
    assert.equal(result.game.state.stats.orbs, 3, `variant ${variant}`);
  }
});

test('crossing variants use distinct void lengths', () => {
  assert.deepEqual(LONG_GAP_CROSSINGS.map(layout => layout.find(t => t.kind === 'gap').width), [698, 620, 720]);
});
