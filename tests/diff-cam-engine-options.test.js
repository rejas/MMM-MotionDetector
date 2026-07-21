const assert = require("node:assert");
const { describe, it } = require("node:test");
const { loadEngine, frameWithMotionPixels } = require("./diff-cam-engine-mock");

describe("DiffCamEngine option defaults", () => {
  describe("scoreThreshold", () => {
    it("keeps an explicit zero", async () => {
      const engine = await loadEngine({ init: { scoreThreshold: 0 } });

      assert.strictEqual(engine.engine.getScoreThreshold(), 0);
    });

    it("keeps an explicit non zero value", async () => {
      const engine = await loadEngine({ init: { scoreThreshold: 5 } });

      assert.strictEqual(engine.engine.getScoreThreshold(), 5);
    });

    it("falls back when the option is omitted", async () => {
      const engine = await loadEngine();

      assert.strictEqual(engine.engine.getScoreThreshold(), 16);
    });

    it("falls back when the option is undefined", async () => {
      const engine = await loadEngine({ init: { scoreThreshold: undefined } });

      assert.strictEqual(engine.engine.getScoreThreshold(), 16);
    });

    it("does not treat a completely still frame as motion at a threshold of zero", async () => {
      const engine = await loadEngine({
        frames: [frameWithMotionPixels(0), frameWithMotionPixels(0)],
        init: { scoreThreshold: 0 },
      });

      engine.startStreaming();
      engine.tick(); // primes the previous frame, nothing is diffed yet
      engine.tick();

      // a score of zero means not one pixel changed, which is never motion
      assert.strictEqual(engine.captures[0].score, 0);
      assert.strictEqual(engine.captures[0].hasMotion, false);
      assert.strictEqual(engine.captures[0].motionBox, undefined);
    });

    it("treats a single moving pixel as motion at a threshold of zero", async () => {
      const engine = await loadEngine({
        frames: [frameWithMotionPixels(0), frameWithMotionPixels(1)],
        init: { scoreThreshold: 0 },
      });

      engine.startStreaming();
      engine.tick(); // primes the previous frame, nothing is diffed yet
      engine.tick();

      assert.strictEqual(engine.captures[0].score, 1);
      assert.strictEqual(engine.captures[0].hasMotion, true);
    });
  });

  describe("pixelDiffThreshold", () => {
    it("keeps an explicit zero", async () => {
      const engine = await loadEngine({ init: { pixelDiffThreshold: 0 } });

      assert.strictEqual(engine.engine.getPixelDiffThreshold(), 0);
    });

    it("falls back when the option is omitted", async () => {
      const engine = await loadEngine();

      assert.strictEqual(engine.engine.getPixelDiffThreshold(), 32);
    });

    it("counts every changed pixel at a threshold of zero", async () => {
      const engine = await loadEngine({
        frames: [frameWithMotionPixels(0), frameWithMotionPixels(5)],
        init: { pixelDiffThreshold: 0, scoreThreshold: 1 },
      });

      engine.startStreaming();
      engine.tick();
      engine.tick();

      // only the pixels that actually changed, not the whole frame
      assert.strictEqual(engine.captures[0].score, 5);
    });

    it("counts no pixels of a still frame at a threshold of zero", async () => {
      const engine = await loadEngine({
        frames: [frameWithMotionPixels(0), frameWithMotionPixels(0)],
        init: { pixelDiffThreshold: 0, scoreThreshold: 20 },
      });

      engine.startStreaming();
      engine.tick();
      engine.tick();

      // an unchanged pixel is never significant, so the score guard stays
      // meaningful instead of every frame scoring the full 64x48
      assert.strictEqual(engine.captures[0].score, 0);
      assert.strictEqual(engine.captures[0].hasMotion, false);
    });
  });

  describe("jpegQuality", () => {
    /**
     * Capture one frame and ask the engine for its data URL.
     * @param initOptions options passed to DiffCamEngine.init
     * @returns {Promise<Array>} the arguments toDataURL was called with
     */
    async function captureUrlArgs(initOptions) {
      const engine = await loadEngine({
        frames: [frameWithMotionPixels(0), frameWithMotionPixels(5)],
        init: { scoreThreshold: 1, ...initOptions },
      });

      engine.startStreaming();
      engine.tick();
      engine.tick();
      engine.captures[0].getURL();

      return engine.dataUrlCalls.at(-1);
    }

    it("defaults to 0.7", async () => {
      assert.deepStrictEqual(await captureUrlArgs({}), ["image/jpeg", 0.7]);
    });

    it("keeps an explicit zero rather than falling back", async () => {
      // zero is the lowest valid quality, not an unset option
      assert.deepStrictEqual(await captureUrlArgs({ jpegQuality: 0 }), ["image/jpeg", 0]);
    });

    it("ignores the quality for a non jpeg mime type", async () => {
      assert.deepStrictEqual(await captureUrlArgs({ imageMimeType: "image/png" }), ["image/png"]);
    });
  });

  describe("setters", () => {
    it("keeps a zero score threshold set after init", async () => {
      const engine = await loadEngine({ init: { scoreThreshold: 5 } });

      engine.engine.setScoreThreshold(0);

      assert.strictEqual(engine.engine.getScoreThreshold(), 0);
    });

    it("keeps a zero pixel diff threshold set after init", async () => {
      const engine = await loadEngine();

      engine.engine.setPixelDiffThreshold(0);

      assert.strictEqual(engine.engine.getPixelDiffThreshold(), 0);
    });
  });
});
