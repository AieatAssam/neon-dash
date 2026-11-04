import test from 'node:test';
import assert from 'node:assert/strict';
import { drawShieldIndicator, drawShieldMark, SHIELD_GOLD } from '../powerup-visuals.ts';

function recordingContext() {
  const calls = [];
  const ctx = {
    calls,
    save: () => calls.push(['save']),
    restore: () => calls.push(['restore']),
    translate: (...args) => calls.push(['translate', ...args]),
    beginPath: () => calls.push(['beginPath']),
    moveTo: (...args) => calls.push(['moveTo', ...args]),
    lineTo: (...args) => calls.push(['lineTo', ...args]),
    quadraticCurveTo: (...args) => calls.push(['quadraticCurveTo', ...args]),
    closePath: () => calls.push(['closePath']),
    fill: () => calls.push(['fill']),
    stroke: () => calls.push(['stroke']),
  };
  return ctx;
}

test('shield indicator stays absent until a charge is held', () => {
  const ctx = recordingContext();
  drawShieldIndicator(ctx, 20, 30, 18, false);
  assert.deepEqual(ctx.calls, []);
  drawShieldIndicator(ctx, 20, 30, 18, true);
  assert.equal(ctx.calls[0][0], 'save');
  assert.ok(ctx.calls.some(([name]) => name === 'fill'));
  assert.equal(ctx.calls.at(-1)[0], 'restore');
});

test('pickup mark uses a centered shield shape and accepts its highlight color', () => {
  const ctx = recordingContext();
  drawShieldMark(ctx, 8, 12, 20, SHIELD_GOLD);
  assert.ok(ctx.calls.some(call => call[0] === 'translate' && call[1] === 8 && call[2] === 12));
  assert.ok(ctx.calls.some(call => call[0] === 'moveTo' && call[1] === 0 && call[2] === -10));
  assert.equal(ctx.fillStyle, SHIELD_GOLD);
});
