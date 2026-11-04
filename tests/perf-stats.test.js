import test from 'node:test';
import assert from 'node:assert/strict';
import { summarizeRuns } from '../scripts/perf-stats.mjs';

test('summarizes completed runs without silently merging incomplete runs', () => {
 const result = summarizeRuns([
  { samples: [10, 20, 30], endedEarly: false },
  { samples: [200], endedEarly: true },
  { samples: [30, 40, 50], endedEarly: false },
 ], 3);
 assert.equal(result.completedRuns, 2);
 assert.equal(result.incompleteRuns, 1);
 assert.equal(result.medianRunMeanMs, 30);
 assert.deepEqual(result.runs[0].samples, [10, 20, 30]);
 assert.equal(result.runs[1].complete, false);
});

test('reports no median when no run has sufficient samples', () => {
 const result = summarizeRuns([{ samples: [], endedEarly: true }], 3);
 assert.equal(result.completedRuns, 0);
 assert.equal(result.medianRunMeanMs, null);
});
