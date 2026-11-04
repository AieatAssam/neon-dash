import test from 'node:test';
import assert from 'node:assert/strict';
import { collectShield, createPowerUpState, resolveCollision } from '../powerups.ts';

test('shield pickup grants one charge and does not stack', () => {
  const empty = createPowerUpState();
  const charged = collectShield(empty);
  assert.deepEqual(charged, { shieldCharges: 1, shieldsUsed: 0 });
  assert.equal(collectShield(charged), charged);
  assert.deepEqual(empty, { shieldCharges: 0, shieldsUsed: 0 });
});

test('only a fatal collision consumes the shield and lets the run continue', () => {
  const charged = collectShield(createPowerUpState());
  const harmless = resolveCollision(charged, false);
  assert.equal(harmless.absorbed, false);
  assert.equal(harmless.state, charged);

  const blocked = resolveCollision(charged, true);
  assert.equal(blocked.absorbed, true);
  assert.deepEqual(blocked.state, { shieldCharges: 0, shieldsUsed: 1 });
  assert.equal(resolveCollision(blocked.state, true).absorbed, false);
});

test('identical replay event sequences produce identical power-up transitions', () => {
  const replay = () => {
    let state = createPowerUpState();
    state = collectShield(state);
    const collision = resolveCollision(state, true);
    return [collision.absorbed, collision.state, resolveCollision(collision.state, true).absorbed];
  };
  assert.deepEqual(replay(), replay());
});
