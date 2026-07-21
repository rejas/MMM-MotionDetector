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

    it("counts every pixel at a threshold of zero", async () => {
      const totalPixels = 64 * 48;
      const engine = await loadEngine({
        frames: [frameWithMotionPixels(0), frameWithMotionPixels(1)],
        init: { pixelDiffThreshold: 0, scoreThreshold: 1 },
      });

      engine.startStreaming();
      engine.tick();
      engine.tick();

      assert.strictEqual(engine.captures[0].score, totalPixels);
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
