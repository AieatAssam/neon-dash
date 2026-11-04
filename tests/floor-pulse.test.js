import { courseInput } from './course-solver.js';
import test from 'node:test';
import assert from 'node:assert/strict';
import { createGame, floorPulseState, step } from '../core.ts';
import { BEAT_SECONDS } from '../rhythm.ts';

const pulse = { x: 100, width: 64, height: 36, phase: null, kind: 'pulse', pulseTime: 2 };

test('floor pulse gives a complete beat of warning and exact active boundaries', () => {
  assert.equal(floorPulseState(pulse, 1.75 - BEAT_SECONDS - .001), 'dormant');
  assert.equal(floorPulseState(pulse, 1.75 - BEAT_SECONDS), 'warning');
  assert.equal(floorPulseState(pulse, 1.749), 'warning');
  assert.equal(floorPulseState(pulse, 1.75), 'active');
  assert.equal(floorPulseState(pulse, 2.299), 'active');
  assert.equal(floorPulseState(pulse, 2.3), 'dormant');
});

test('only the visible active rectangle collides, including its left edge', () => {
  for (const [time, y, status] of [[1.4, 276, 'running'], [2, 276, 'dead'], [2.4, 276, 'running'], [2, 230, 'running']]) {
    const game = createGame({ obstacleStartX: 10000, speed: 0, maxSpeed: 0 });
    game.state.time = time;
    game.state.runner.y = y;
    game.state.obstacles = [{ ...pulse, x: 123 }];
    step(game);
    assert.equal(game.state.status, status, `time ${time}, y ${y}`);
  }
});

test('seeded runs expose beat-aligned pulses and a simple jump solver clears them', () => {
  for (const seed of [1, 17, 42]) {
    for (const speed of [240, 340]) {
      const game = createGame({ mode: 'challenge', seed, speed, maxSpeed: speed });
      let seen = false;
      for (let i = 0; i < 120 * 80 && game.state.status === 'running'; i++) {
        const s = game.state;
        for (const obstacle of s.obstacles.filter(o => o.kind === 'pulse')) {
          seen = true;
          assert.ok(Math.abs(obstacle.pulseTime / BEAT_SECONDS - Math.round(obstacle.pulseTime / BEAT_SECONDS)) < 1e-8);
        }
        step(game, courseInput(game));
      }
      assert.ok(seen, `seed ${seed}, speed ${speed} contains a pulse`);
      assert.equal(game.state.status, 'won', `seed ${seed}, speed ${speed}`);
    }
  }
});
