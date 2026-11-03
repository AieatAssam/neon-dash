import test from 'node:test';
import assert from 'node:assert/strict';
import { BEAT_SECONDS, BeatClock, beatEnvelope, musicPosition, musicNeedsSync } from '../rhythm.ts';

test('115 BPM envelope peaks on beats and rests between them', () => {
  assert.equal(beatEnvelope(0), 1);
  assert.equal(beatEnvelope(BEAT_SECONDS), 1);
  assert.equal(beatEnvelope(BEAT_SECONDS / 2), 0);
  assert.ok(Math.abs(beatEnvelope(BEAT_SECONDS * .25) - .125) < 1e-12);
  assert.ok(Math.abs(beatEnvelope(BEAT_SECONDS - 1e-6) - beatEnvelope(1e-6)) < 1e-12);
});

test('muted clock continues audio phase and pauses with simulation', () => {
  const clock = new BeatClock();
  assert.equal(clock.sample(10, 9.75), 9.75);
  assert.equal(clock.sample(10), 9.75);
  assert.equal(clock.sample(10.5), 10.25);
  assert.equal(clock.sample(10.5), 10.25);
  assert.equal(clock.sample(11, 10), 10);
  clock.reset();
  assert.equal(clock.sample(0), 0);
});

test('music position follows simulation across muting, pause and track loops', () => {
  assert.equal(musicPosition(15, 60), 15);
  assert.equal(musicPosition(75, 60), 15);
  assert.equal(musicPosition(75, NaN), 75);
  assert.equal(musicPosition(75, Infinity), 75);
  assert.equal(musicPosition(75, 0), 75);
});

test('music drift correction tolerates small timing error and loop boundaries', () => {
  assert.equal(musicNeedsSync(10.05, 10, 60), false);
  assert.equal(musicNeedsSync(9, 10, 60), true);
  assert.equal(musicNeedsSync(59.98, 60.02, 60), false);
  assert.equal(musicNeedsSync(15, 75, 60), false);
  assert.equal(musicNeedsSync(15, 20, NaN), true);
});
