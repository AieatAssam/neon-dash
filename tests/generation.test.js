import test from 'node:test';
import assert from 'node:assert/strict';
import { createGame, step } from '../core.ts';
import { BEAT_SECONDS } from '../rhythm.ts';

function play(game, seconds) {
  for (let i = 0; i < 120 * seconds && game.state.status === 'running'; i++) {
    const s = game.state;
    const x = s.distance + s.runner.x;
    const next = [...s.obstacles, ...s.terrain].filter(o => o.x + o.width > x - 3).sort((a,b) => a.x-b.x)[0];
    const gate = s.obstacles.find(o => o.kind === 'gate' && o.x + o.width > x);
    step(game, {
      jump: Boolean(next && next.kind !== 'gate' && next.x - x < s.speed * .19 && s.runner.grounded),
      togglePhase: Boolean(gate && gate.x - x < s.speed * .6 && gate.phase === s.phase),
    });
  }
}

test('generated cluster arrivals follow the track beat at varied speeds', () => {
  for (const speed of [240, 280, 340]) {
    const game = createGame({ speed, maxSpeed: speed, seed: 17 });
    for (const obstacle of game.state.obstacles) {
      // Adjacent spike pieces belong to the same beat-aligned cluster.
      if (game.state.obstacles.some(o => o !== obstacle && obstacle.x - o.x === 28)) continue;
      const beat = (obstacle.x - game.config.runnerX) / speed / BEAT_SECONDS;
      assert.ok(Math.abs(beat - Math.round(beat)) < 1e-8, `off-beat arrival: ${beat}`);
    }
  }
});

test('six seeds are solvable at fixed and ramping speeds with collectible jump arcs', () => {
  for (const seed of [1, 7, 17, 42, 71, 12345]) {
    for (const speed of [240, 280, 340, null]) {
      const game = createGame({ mode: 'challenge', seed, ...(speed ? { speed, maxSpeed: speed } : {}) });
      play(game, 45);
      assert.equal(game.state.status, 'won', `seed ${seed}, speed ${speed}, distance ${game.state.distance}`);
      assert.ok(game.state.stats.orbs >= 3, `collectible path seed ${seed}, speed ${speed}`);
    }
  }
});

test('200 seeds in both modes retain the forgiving hand-authored opening', () => {
  for (let seed = 1; seed <= 200; seed++) {
    for (const mode of ['endless', 'challenge']) {
      const game = createGame({ mode, seed, speed: 240, maxSpeed: 240 });
      const gate = game.state.obstacles.find(o => o.kind === 'gate');
      const terrain = game.state.terrain[0];
      assert.ok(gate && Math.abs((gate.x - game.config.runnerX) / game.config.speed - 8 * BEAT_SECONDS) < .01, `${mode} gate seed ${seed}`);
      assert.equal(gate.phase, 0, `${mode} opening gate phase seed ${seed}`);
      assert.ok(terrain && Math.abs((terrain.x - game.config.runnerX) / game.config.speed - 14 * BEAT_SECONDS) < .01, `${mode} terrain seed ${seed}`);
      assert.ok(['gap', 'platform'].includes(terrain.kind));
    }
    const endless = createGame({ mode: 'endless', seed });
    play(endless, 10);
    assert.equal(endless.state.status, 'running', `endless seed ${seed}`);
    const ramping = createGame({ mode: 'challenge', seed });
    play(ramping, 45);
    assert.equal(ramping.state.status, 'won', `seed ${seed}`);
  }
});


test('onboarding has at least 2.5 seconds before the first hazard', () => {
  for (const speed of [240, 280, 340]) {
    const game = createGame({ speed, maxSpeed: speed });
    assert.ok((game.state.obstacles[0].x - game.config.runnerX) / speed >= 2.5);
  }
});

test('speed-ramped arrivals stay within one pixel of the beat grid', () => {
  const game = createGame({ seed: 7 });
  const firstX = game.state.obstacles[0].x;
  while (game.state.time + game.config.fixedStep / 2 < 8 * BEAT_SECONDS) {
    game.state.runner.y = -10000;
    game.state.runner.vy = 0;
    step(game);
  }
  const expectedDistance = firstX - game.config.runnerX;
  // Sampling uncertainty is at most half a fixed step of travel.
  assert.ok(Math.abs(game.state.distance - expectedDistance) < game.state.speed * game.config.fixedStep / 2 + .1);
});
