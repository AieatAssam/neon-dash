import test from 'node:test';
import assert from 'node:assert/strict';
import { colorAttractionAcceleration } from '../color-attraction.ts';

const field = { x: 0, y: 0, radius: 100, phase: 0, maxAcceleration: 600 };

test('matching color attracts toward the field center with bounded vertical force', () => {
  assert.ok(colorAttractionAcceleration({ x: 0, y: 25 }, field, 0) < 0);
  assert.ok(colorAttractionAcceleration({ x: 0, y: -25 }, field, 0) > 0);
  assert.equal(colorAttractionAcceleration({ x: 0, y: 25 }, field, 1), 0);
  assert.equal(colorAttractionAcceleration({ x: 0, y: 100 }, field, 0), 0);
  assert.equal(colorAttractionAcceleration({ x: 0, y: 0 }, field, 0), 0);
});

test('force depends on local radial distance and fades smoothly to the edge', () => {
  const near = colorAttractionAcceleration({ x: 0, y: 10 }, field, 0);
  const far = colorAttractionAcceleration({ x: 0, y: 75 }, field, 0);
  const edge = colorAttractionAcceleration({ x: 0, y: 99 }, field, 0);
  assert.ok(near < far && far < edge, 'acceleration magnitude declines with distance');
  assert.ok(Math.abs(edge) < 2, 'force is close to zero at the boundary');
  assert.equal(colorAttractionAcceleration({ x: 100, y: 0 }, field, 0), 0);
});

test('diagonal attraction is projected vertically and never exceeds its cap', () => {
  const diagonal = colorAttractionAcceleration({ x: 40, y: 30 }, field, 0);
  const vertical = colorAttractionAcceleration({ x: 0, y: 50 }, field, 0);
  assert.ok(diagonal < 0);
  assert.ok(Math.abs(diagonal) < Math.abs(vertical));
  assert.ok(Math.abs(diagonal) <= field.maxAcceleration);
  assert.ok(Math.abs(colorAttractionAcceleration({ x: 0, y: 1 }, { ...field, maxAcceleration: 200 }, 0)) <= 200);
});

test('same inputs always produce the same force and invalid field values are inert', () => {
  const point = { x: 12, y: 34 };
  assert.equal(colorAttractionAcceleration(point, field, 0), colorAttractionAcceleration(point, field, 0));
  assert.equal(colorAttractionAcceleration(point, { ...field, radius: 0 }, 0), 0);
  assert.equal(colorAttractionAcceleration({ x: NaN, y: 1 }, field, 0), 0);
});
