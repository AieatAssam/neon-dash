import test from 'node:test';
import assert from 'node:assert/strict';
import { evaluateAchievements, mergeProgress } from '../achievements.js';

test('milestones unlock only when run thresholds are reached', () => {
  assert.deepEqual(evaluateAchievements({ distance: 999, stats: { jumps: 0, switches: 0, neutralCleared: 0 } }), []);
  assert.deepEqual(evaluateAchievements({ distance: 1000, stats: { jumps: 10, switches: 10, neutralCleared: 5 } }), ['distance-1000', 'jump-10', 'switch-10', 'neutral-5']);
});

test('progress keeps records and unlocks without duplicating them', () => {
  const first = mergeProgress({}, { distance: 1000, stats: { jumps: 10, switches: 0, neutralCleared: 0 } });
  const second = mergeProgress(first, { distance: 200, stats: { jumps: 10, switches: 10, neutralCleared: 0 } });
  assert.equal(second.bestDistance, 1000);
  assert.equal(second.runs, 2);
  assert.deepEqual(second.unlocked, ['distance-1000', 'jump-10', 'switch-10']);
});
