import test from "node:test";
import assert from "node:assert/strict";
import { isPortrait, lookaheadUnits, shaftLayout, viewportWorldSize } from "../viewport.ts";

const PHONES = [[360, 640], [390, 844], [430, 932]];
const LANDSCAPE = [[844, 390], [932, 430], [1280, 800]];

test("portrait phones see at least 1.35 s ahead at the opening speed and keep the runner visible", () => {
  for (const [width, height] of PHONES) {
    assert.ok(isPortrait(width, height));
    const world = viewportWorldSize(width, height);
    assert.ok(world.scale * 24 >= 20, `${width}x${height} runner ${world.scale * 24}px`);
    assert.ok(lookaheadUnits(width, height) / 260 >= 1.35, `${width}x${height}`);
  }
});

test("landscape framing fits the runway band and sees further ahead than portrait", () => {
  for (const [width, height] of LANDSCAPE) {
    const world = viewportWorldSize(width, height);
    assert.ok(world.height >= 440 - 1e-9, `${width}x${height}`);
    assert.ok(world.scale * 24 >= 21, `${width}x${height}`);
    assert.ok(lookaheadUnits(width, height) / 260 >= 2, `${width}x${height}`);
  }
});

test("the shaft fills phone width in portrait and stays a centered lane in landscape", () => {
  for (const [width, height] of PHONES) {
    const lane = shaftLayout(width, height);
    assert.equal(lane.x, 0);
    assert.equal(lane.width, width);
  }
  for (const [width, height] of LANDSCAPE) {
    const lane = shaftLayout(width, height);
    assert.ok(lane.x > 0 && Math.abs(lane.x * 2 + lane.width - width) < 1e-9, `${width}x${height}`);
    // At least a second of gates is visible below the runner at the shaft's top speed.
    assert.ok(height * (1 - lane.runnerShare) / lane.scale / 300 >= 1, `${width}x${height}`);
  }
});
