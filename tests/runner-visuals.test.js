import test from 'node:test';
import assert from 'node:assert/strict';
import { RunnerTrail, RUNNER_FACE } from '../runner-visuals.ts';

test('trail interpolates historical jump height and keeps world positions', () => {
 const trail = new RunnerTrail();
 trail.record(0, 120, 300);
 trail.record(.1, 150, 240);
 trail.record(.2, 180, 260);
 assert.deepEqual(trail.at(.05), { time: .05, x: 135, y: 270 });
 assert.equal(trail.at(.1).x - 60, 90);
 assert.equal(trail.at(.1).y, 240);
 assert.equal(trail.at(-.01), undefined);
});

test('history stays bounded and resets across retries and checkpoint rewinds', () => {
 const trail = new RunnerTrail();
 for (let i = 0; i < 1200; i++) trail.record(i / 120, i, i);
 assert.ok(trail.samples.length < 40);
 trail.reset();
 assert.equal(trail.at(9), undefined);
 trail.record(5, 100, 200);
 trail.record(2, 20, 30);
 assert.equal(trail.samples.length, 1);
 assert.equal(trail.at(1), undefined);
});

test('face eyes mirror each other and mouth is centered', () => {
 const [left, right, mouth] = RUNNER_FACE;
 assert.equal(left[0] + left[2], -right[0]);
 assert.equal(left[1], right[1]);
 assert.equal(mouth[0] + mouth[2] / 2, 0);
});
