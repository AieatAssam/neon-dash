import test from "node:test";
import assert from "node:assert/strict";
import { viewportWorldSize } from "../viewport.ts";

test("portrait framing keeps the 24-unit runner at least 28 CSS pixels tall", () => {
  for (const [width, height] of [[360, 640], [390, 844], [430, 932]]) {
    const world = viewportWorldSize(width, height);
    assert.ok(world.scale * 24 >= 28, `${width}x${height}`);
    assert.equal(world.scale, Math.max(28 / 24, height / 720));
  }
});

test("wide viewport keeps the existing world framing", () => {
  const world = viewportWorldSize(1280, 800);
  assert.equal(world.width, 1280 / Math.min(1280 / 680, 800 / 480));
});
