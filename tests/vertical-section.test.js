import test from 'node:test';
import assert from 'node:assert/strict';
import { createVerticalSection, createVerticalSectionCourse, stepVerticalSection, VERTICAL_SECTION_DT } from '../vertical-section.ts';

const config = { width: 420, height: 900, forwardSpeed: 240 };

test('vertical section advances in fixed deterministic ticks', () => {
  let a = createVerticalSection(config);
  let b = createVerticalSection(config);
  for (let i = 0; i < 60; i++) {
    a = stepVerticalSection(a, {}, config);
    b = stepVerticalSection(b, {}, config);
  }
  assert.deepEqual(a, b);
  assert.equal(a.ticks, 60);
  assert.equal(a.y, 120);
  assert.equal(VERTICAL_SECTION_DT, 1 / 120);
});

test('host fixed step overrides the standalone tick duration', () => {
  const hostStep = 1 / 60;
  const hostConfig = { ...config, fixedStep: hostStep };
  const state = stepVerticalSection(createVerticalSection(hostConfig), {}, hostConfig);
  assert.equal(state.y, config.forwardSpeed * hostStep);
});

test('color switch redirects attraction from left wall to right wall', () => {
  let state = createVerticalSection(config);
  for (let i = 0; i < 90; i++) state = stepVerticalSection(state, {}, config);
  assert.ok(state.x < config.width / 2);
  state = stepVerticalSection(state, { switchPressed: true }, config);
  assert.equal(state.phase, 1);
  for (let i = 0; i < 180; i++) state = stepVerticalSection(state, {}, config);
  assert.ok(state.x > config.width / 2);
});

test('obstacle collision freezes progression and course obstacles leave a safe wall route', () => {
  const blocked = { ...config, obstacles: [{ x: 180, y: 0, width: 60, height: 60 }] };
  let state = createVerticalSection(blocked);
  state = stepVerticalSection(state, {}, blocked);
  assert.equal(state.crashed, true);
  const frozen = stepVerticalSection(state, { switchPressed: true }, blocked);
  assert.deepEqual(frozen, state);
});

test('seeded courses vary safe sides, repeat some sides, and timed inputs clear every gate', () => {
  let hasConsecutiveSameSide = false;
  for (const speed of [240, 280, 320]) for (const seed of [0, 1, 17, 0xdeadbeef]) {
    const obstacles = createVerticalSectionCourse(seed, 5);
    assert.deepEqual(obstacles, createVerticalSectionCourse(seed, 5));
    for (let i = 1; i < obstacles.length; i++) {
      if (obstacles[i].x === obstacles[i - 1].x) hasConsecutiveSameSide = true;
    }
    const section = { ...config, forwardSpeed: speed, obstacles };
    let state = createVerticalSection(section);
    let switchedForGate = new Set();
    for (let i = 0; i < 4000 && !state.crashed && state.y < 3000; i++) {
      const gateIndex = obstacles.findIndex((gate, index) =>
        !switchedForGate.has(index) && state.y >= gate.y - 450,
      );
      let switchPressed = false;
      if (gateIndex >= 0) {
        const blockedLeft = obstacles[gateIndex].x === 0;
        const safePhase = blockedLeft ? 1 : 0;
        if (state.phase !== safePhase) switchPressed = true;
        switchedForGate.add(gateIndex);
      }
      state = stepVerticalSection(state, { switchPressed }, section);
    }
    assert.equal(state.crashed, false, `seed ${seed} at speed ${speed} should have a collision-free timed route`);
    assert.ok(state.y >= obstacles.at(-1).y + obstacles.at(-1).height);
  }
  assert.equal(hasConsecutiveSameSide, true, 'seeded variety should include repeated safe-side requests');
});
