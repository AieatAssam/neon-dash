import test from 'node:test';
import assert from 'node:assert/strict';
import { createGame, step, VERTICAL_WARP_SECONDS, VERTICAL_FIRST_LETHAL_Y, VERTICAL_SAFE_RUNWAY_Y } from '../core.ts';
import { courseInput } from './course-solver.js';

function enterVertical(game) {
  game.generated = false;
  game.state.obstacles = [];
  game.state.terrain = [];
  game.state.runner.grounded = true;
  game.state.distance = 5000;
  const warpSteps = Math.ceil(VERTICAL_WARP_SECONDS / game.config.fixedStep) + 6;
  for (let i = 0; i < warpSteps; i++) step(game);
  assert.ok(game.verticalState, 'should finish warp into vertical play');
}

function surviveVertical(game, seconds, input) {
  const steps = Math.ceil(seconds / game.config.fixedStep);
  for (let i = 0; i < steps && game.state.status === 'running'; i++) step(game, input(game));
  return game.state.status;
}

test('first lethal gate is far enough for a safe vertical runway', () => {
  const game = createGame({ mode: 'challenge', seed: 11 });
  const first = game.verticalObstacles.find(o => !o.passive);
  assert.ok(first);
  assert.ok(first.y >= VERTICAL_FIRST_LETHAL_Y - 2);
  enterVertical(game);
  assert.equal(game.verticalGraceUntilY, VERTICAL_SAFE_RUNWAY_Y);
});

test('naive players usually survive the opening color wall', () => {
  let deaths = 0;
  const trials = 80;
  for (let seed = 0; seed < trials; seed++) {
    const game = createGame({ mode: 'challenge', seed });
    enterVertical(game);
    if (surviveVertical(game, 3.5, () => ({ jump: false, togglePhase: false })) === 'dead') deaths++;
  }
  assert.ok(deaths / trials <= 0.22, `naive death rate ${deaths}/${trials} should stay low with runway + grace`);
});

test('teaching bot survives the first vertical segment across seeds', () => {
  for (const seed of [0, 1, 5, 17, 42, 99, 0xdeadbeef]) {
    const game = createGame({ mode: 'challenge', seed });
    enterVertical(game);
    assert.equal(surviveVertical(game, 3, courseInput), 'running', `seed ${seed} should survive opening vertical with steering`);
  }
});
