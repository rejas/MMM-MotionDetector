const assert = require("node:assert");
const { describe, it } = require("node:test");
const { loadEngine, frameWithMotionPixels } = require("./diff-cam-engine-mock");

const SCORE_THRESHOLD = 30;

/**
 * Run one diffed capture against a frame with the given number of moving pixels.
 * @param movingPixels how many pixels should exceed the diff threshold
 * @returns {Promise<object>} the capture result handed to captureCallback
 */
async function captureWith(movingPixels) {
  const engine = await loadEngine({
    frames: [frameWithMotionPixels(0), frameWithMotionPixels(movingPixels)],
    init: { includeMotionBox: true, scoreThreshold: SCORE_THRESHOLD },
  });

  engine.startStreaming();
  engine.tick(); // primes the previous frame, nothing is diffed yet
  engine.tick();

  return engine.captures[0];
}

describe("DiffCamEngine motion box", () => {
  it("reports a motion box once the score reaches the threshold", async () => {
    const capture = await captureWith(SCORE_THRESHOLD);

    assert.strictEqual(capture.score, SCORE_THRESHOLD);
    assert.strictEqual(capture.hasMotion, true);
    assert.ok(capture.motionBox, "expected a motion box for a frame that already counts as motion");
  });

  it("reports a motion box above the threshold", async () => {
    const capture = await captureWith(SCORE_THRESHOLD + 10);

    assert.strictEqual(capture.hasMotion, true);
    assert.ok(capture.motionBox);
  });

  it("reports no motion box below the threshold", async () => {
    const capture = await captureWith(SCORE_THRESHOLD - 1);

    assert.strictEqual(capture.hasMotion, false);
    assert.strictEqual(capture.motionBox, undefined);
  });

  it("uses the same threshold comparison as hasMotion", async () => {
    for (const movingPixels of [SCORE_THRESHOLD - 1, SCORE_THRESHOLD, SCORE_THRESHOLD + 1]) {
      const capture = await captureWith(movingPixels);

      assert.strictEqual(
        Boolean(capture.motionBox),
        capture.hasMotion,
        `motionBox and hasMotion disagree at a score of ${movingPixels}`
      );
    }
  });
});
