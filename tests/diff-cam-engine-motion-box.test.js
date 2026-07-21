const assert = require("node:assert");
const { describe, it } = require("node:test");
const { loadEngine, frameWithMotionAt } = require("./diff-cam-engine-mock");

const MOVING_PIXELS = [
  { x: 5, y: 3 },
  { x: 20, y: 10 },
  { x: 12, y: 40 },
];

/**
 * Run one diffed capture over a frame with motion at the given coordinates.
 * @param pixels list of {x, y} coordinates that should move
 * @param options extra options passed to DiffCamEngine.init
 * @returns {Promise<object>} the capture result handed to captureCallback
 */
async function captureAt(pixels, options = {}) {
  const engine = await loadEngine({
    frames: [frameWithMotionAt([]), frameWithMotionAt(pixels)],
    init: { includeMotionBox: true, scoreThreshold: 1, ...options },
  });

  engine.startStreaming();
  engine.tick(); // primes the previous frame, nothing is diffed yet
  engine.tick();

  return engine.captures[0];
}

describe("DiffCamEngine motion box", () => {
  it("spans every moving pixel", async () => {
    const capture = await captureAt(MOVING_PIXELS);

    assert.strictEqual(capture.score, MOVING_PIXELS.length);
    assert.deepStrictEqual(capture.motionBox, {
      x: { min: 5, max: 20 },
      y: { min: 3, max: 40 },
    });
  });

  it("collapses to a single point for one moving pixel", async () => {
    const engine = await loadEngine({
      frames: [frameWithMotionAt([]), frameWithMotionAt([{ x: 7, y: 9 }])],
      init: { includeMotionBox: true, scoreThreshold: 0 },
    });

    engine.startStreaming();
    engine.tick();
    engine.tick();

    assert.deepStrictEqual(engine.captures[0].motionBox, {
      x: { min: 7, max: 7 },
      y: { min: 9, max: 9 },
    });
  });

  it("does not leak coordinates between captures", async () => {
    const engine = await loadEngine({
      frames: [frameWithMotionAt([]), frameWithMotionAt([{ x: 60, y: 45 }]), frameWithMotionAt([{ x: 1, y: 2 }])],
      init: { includeMotionBox: true, scoreThreshold: 0 },
    });

    engine.startStreaming();
    engine.tick();
    engine.tick();
    engine.tick();

    assert.deepStrictEqual(engine.captures[0].motionBox, {
      x: { min: 60, max: 60 },
      y: { min: 45, max: 45 },
    });
    assert.deepStrictEqual(engine.captures[1].motionBox, {
      x: { min: 1, max: 1 },
      y: { min: 2, max: 2 },
    });
  });

  it("reports the moving pixels when asked", async () => {
    const capture = await captureAt(MOVING_PIXELS, { includeMotionPixels: true });

    for (const { x, y } of MOVING_PIXELS) {
      assert.strictEqual(capture.checkMotionPixel(x, y), true, `expected motion at ${x},${y}`);
    }
    assert.ok(!capture.checkMotionPixel(0, 0));
  });
});
