import { courseInput } from './course-solver.js';
import test from 'node:test';
import assert from 'node:assert/strict';
import { createGame, step } from '../core.ts';
import { LONG_GAP_CROSSINGS } from '../long-gap-crossing.ts';
import { BEAT_SECONDS } from '../rhythm.ts';

function play(game, seconds) {
  const crossings = new Set();
  const stones = new Set();
  const postVerticalCrossings = new Set();
  for (let i = 0; i < 120 * seconds && game.state.status === 'running'; i++) {
    const s = game.state;
    // The vertical scene replaces the horizontal world while active. Ignore its
    // frozen terrain arrays; continue measuring crossings on both sides of it.
    if (!game.verticalState) {
      const runnerWorldX = s.distance + s.runner.x;
      for (const gap of s.terrain.filter(t => t.kind === 'gap' && t.width >= 600)) {
        // Course generation keeps a long lookahead. Count a crossing only once
        // the runner actually reaches its approach, not when it is first queued.
        if (runnerWorldX + s.runner.width < gap.x - 120 || runnerWorldX > gap.x + gap.width) continue;
        crossings.add(gap.x);
        if (game.verticalComplete) postVerticalCrossings.add(gap.x);
        const stonesInGap = s.terrain.filter(t => t.kind === 'platform' && t.x > gap.x && t.x < gap.x + gap.width);
        for (const stone of stonesInGap) {
          if (s.runner.grounded && Math.abs(s.runner.y + s.runner.height - (game.config.groundY - stone.height)) < .01 &&
            s.distance + s.runner.x >= stone.x - s.runner.width && s.distance + s.runner.x < stone.x + stone.width) stones.add(`${gap.x}:${stone.x}`);
        }

      }
    }
    step(game, courseInput(game));
  }
  return { crossings, stones, postVerticalCrossings };
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
      const route = play(game, 80);
      assert.ok(route.crossings.size >= 1, 'production course emits long crossings');
      assert.ok(route.postVerticalCrossings.size >= 1, `horizontal course generation and play resume after the vertical scene seed ${seed}, speed ${speed}, distance ${game.state.distance}, complete ${game.verticalComplete}`);
      assert.ok(route.stones.size >= route.crossings.size * 2,
        `solver lands on both stones per active crossing (seed ${seed}, speed ${speed}, ${route.stones.size}/${route.crossings.size * 2})`);
      assert.equal(game.state.status, 'won', `seed ${seed}, speed ${speed}, distance ${game.state.distance}`);
      assert.ok(game.state.stats.orbs >= 3, `collectible path seed ${seed}, speed ${speed}`);
    }
  }
});

test('200 seeds in both modes retain varied forgiving openings', () => {
  const openingKinds = new Set();
  const gatePhases = new Set();
  for (let seed = 1; seed <= 200; seed++) {
    for (const mode of ['endless', 'challenge']) {
      const game = createGame({ mode, seed, speed: 240, maxSpeed: 240 });
      const first = [...game.state.obstacles, ...game.state.terrain].sort((a, b) => a.x - b.x)[0];
      openingKinds.add(first.kind || 'spike');
      const gate = game.state.obstacles.find(o => o.kind === 'gate');
      const terrain = game.state.terrain[0];
      if (gate) {
        assert.ok(Math.abs((gate.x - game.config.runnerX) / game.config.speed - (seed % 2 ? 8 : 12) * BEAT_SECONDS) < .01, `${mode} gate seed ${seed}`);
        gatePhases.add(gate.phase);
      }
      if (terrain) {
        assert.ok(Math.abs((terrain.x - game.config.runnerX) / game.config.speed - (seed % 2 ? 14 : 8) * BEAT_SECONDS) < .01, `${mode} terrain seed ${seed}`);
        assert.ok(['gap', 'platform'].includes(terrain.kind));
      }
    }
    const endless = createGame({ mode: 'endless', seed });
    play(endless, 10);
    assert.equal(endless.state.status, 'running', `endless seed ${seed}`);
    const ramping = createGame({ mode: 'challenge', seed });
    play(ramping, 80);
    assert.equal(ramping.state.status, 'won', `seed ${seed}`);
  }
  assert.ok(openingKinds.size >= 2, 'opening hazard type varies across seeds');
  assert.equal(gatePhases.size, 2, 'opening gate phase varies across seeds');
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

test('phrases combine jump runs, raised landings, gaps, and spaced gates', () => {
  const game = createGame({ seed: 17, speed: 240, maxSpeed: 240 });
  const features = new Map();
  for (let second = 0; second < 20; second++) {
    for (const feature of [...game.state.obstacles, ...game.state.terrain]) {
      features.set(feature.x, { ...feature });
    }
    play(game, 1);
    assert.equal(game.state.status, 'running');
  }
  const atBeat = beat => features.get(game.config.runnerX + beat * BEAT_SECONDS * 240);
  for (const beat of [16, 18, 20, 22, 44]) {
    const feature = atBeat(beat);
    assert.ok(feature && !feature.kind, `spike cluster at beat ${beat}`);
  }
  const origin = game.config.runnerX + 24 * BEAT_SECONDS * 240 - 90;
  const crossing = [...features.values()].filter(t => t.x >= origin && t.x <= origin + 1030);
  const gap = crossing.find(t => t.kind === 'gap' && t.width >= 600);
  assert.ok(gap, 'terrain phrase contains a continuous long void');
  assert.deepEqual(crossing.filter(t => t.kind === 'platform').map(t => [Math.round(t.x - origin), t.height]),
    LONG_GAP_CROSSINGS[17 % 3].filter(t => t.kind === 'platform').map(t => [t.x, t.height]));
  assert.ok(atBeat(42).kind === 'gap' && atBeat(46).kind === 'gap');
  assert.equal(atBeat(34).kind, 'gate');
  assert.equal(atBeat(38).kind, 'gate');
  assert.ok(atBeat(34).x - (gap.x + gap.width) >= 278, 'clear ground after void before gate');
  for (const gate of [...features.values()].filter(feature => feature.kind === 'gate')) {
    assert.ok([...features.values()].every(feature => feature === gate || Math.abs(feature.x - gate.x) >= 278),
      `gate at ${gate.x} has a clear approach and exit`);
  }
});

test('seeded motif repetitions remain deterministic and vary their jump recipes', () => {
  const layout = seed => {
    const game = createGame({ seed, speed: 240, maxSpeed: 240 });
    const features = new Map();
    for (let second = 0; second < 25; second++) {
      for (const feature of [...game.state.obstacles, ...game.state.terrain]) {
        features.set(feature.x, { ...feature, cleared: undefined });
      }
      play(game, 1);
    }
    return [...features.values()];
  };
  assert.deepEqual(layout(42), layout(42));
  assert.notDeepEqual(layout(42), layout(71));
});


test('seeded gate phrases include repeated and changing phases with clear approaches', () => {
  const phasePairs = new Set();
  for (let seed = 1; seed <= 24; seed++) {
    const game = createGame({ seed, speed: 240, maxSpeed: 240 });
    const features = new Map();
    for (let second = 0; second < 20; second++) {
      for (const feature of [...game.state.obstacles, ...game.state.terrain]) {
        features.set(feature.x, { ...feature });
      }
      play(game, 1);
      assert.equal(game.state.status, 'running', `seed ${seed}`);
    }
    const gates = [...features.values()].filter(feature => feature.kind === 'gate');
    const phraseGates = gates.filter(gate => gate.x >= game.config.runnerX + 32 * BEAT_SECONDS * 240);
    phasePairs.add(phraseGates.slice(0, 2).map(gate => gate.phase).join(''));
    for (const gate of gates) {
      assert.ok([...features.values()].every(feature => feature === gate || Math.abs(feature.x - gate.x) >= 278),
        `clear gate approach seed ${seed}`);
    }
  }
  assert.equal(phasePairs.size, 4, 'both equal-phase and opposite-phase gate pairs occur');
});
