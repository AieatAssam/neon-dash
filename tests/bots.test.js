import test from 'node:test';
import assert from 'node:assert/strict';
import { createGame } from '../core.ts';
import { botFor, simulate, SloppyBot } from '../src/autoplay.ts';

function attempts(kind, seeds, perSeed) {
  const runs = [];
  for (let seed = 1; seed <= seeds; seed++) {
    for (let attempt = 0; attempt < perSeed; attempt++) {
      runs.push({ seed, attempt, ...simulate(createGame({ mode: 'challenge', seed }), botFor(kind, seed * 1000 + attempt), 120) });
    }
  }
  return runs;
}

test('the expert bot wins every challenge seed it is given', () => {
  for (let seed = 1; seed <= 30; seed++) {
    const result = simulate(createGame({ mode: 'challenge', seed }), botFor('good'), 120);
    assert.equal(result.status, 'won', `seed ${seed}: ${result.killer} at ${result.time.toFixed(1)}s`);
    assert.ok(result.clearedVertical);
  }
});

test('a sloppy player comfortably passes the opening and reaches the shaft within three tries', () => {
  const runs = attempts('sloppy', 30, 3);
  const share = predicate => runs.filter(predicate).length / runs.length;
  assert.ok(share(r => r.status !== 'dead' || r.time >= 10) >= .9, 'survive 10 s');
  assert.ok(share(r => r.status !== 'dead' || r.time >= 15) >= .85, 'survive 15 s');
  for (let seed = 1; seed <= 30; seed++) {
    assert.ok(runs.some(r => r.seed === seed && r.reachedVertical), `seed ${seed} reaches the vertical within three attempts`);
  }
  const shaft = runs.filter(r => r.reachedVertical);
  assert.ok(shaft.every(r => r.clearedVertical || r.verticalSeconds >= 5), 'nobody dies in the first five shaft seconds');
  assert.ok(shaft.filter(r => r.clearedVertical).length / shaft.length >= .75, 'most sloppy players clear the shaft');
});

test('ghost input is repeatable for the same course and bot seed', () => {
  const run = () => {
    const game = createGame({ mode: 'challenge', seed: 12 });
    const bot = new SloppyBot(77);
    simulate(game, g => bot.input(g), 40);
    return game.state;
  };
  assert.deepEqual(run(), run());
});
