import test from "node:test";
import assert from "node:assert/strict";
import { MAX_GAME_SPEED, RUNNER_WORLD_X, viewportWorldSize } from "../viewport.ts";

test("portrait viewport scale preserves at least one second of max-speed lookahead", () => {
  for (const [width, height] of [[320, 568], [390, 844]]) {
    const world = viewportWorldSize(width, height);
    assert.ok(world.width - RUNNER_WORLD_X >= MAX_GAME_SPEED);
  }
});

test("wide viewport keeps the existing world framing", () => {
  const world = viewportWorldSize(1280, 800);
  assert.equal(world.width, 1280 / Math.min(1280 / 680, 800 / 480));
});
