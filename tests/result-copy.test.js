import test from 'node:test';
import assert from 'node:assert/strict';
import { resultDetail } from '../result-copy.js';

test('challenge result reports completion percentage', () => {
  assert.equal(resultDetail({ mode: 'challenge', attempt: 3, distance: 2500, level: 2, challengePercent: 41.8 }), 'ATTEMPT 03 · 41% COMPLETE · LEVEL 2');
});

test('endless result reports distance', () => {
  assert.equal(resultDetail({ mode: 'endless', attempt: 12, distance: 843, level: 1, challengePercent: 41.8 }), 'ATTEMPT 12 · 843m · LEVEL 1');
});
