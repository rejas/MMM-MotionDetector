const assert = require("node:assert");
const { describe, it } = require("node:test");
const { loadEngine } = require("./diff-cam-engine-mock");

/**
 * @returns {object} a fake MediaStreamTrack recording whether it was stopped
 */
function createTrack() {
  return {
    stopped: false,
    stop() {
      this.stopped = true;
    },
  };
}

describe("DiffCamEngine", () => {
  describe("stop", () => {
    it("releases every camera track", async () => {
      const tracks = [createTrack(), createTrack()];
      const engine = await loadEngine({ tracks });

      engine.startStreaming();
      engine.engine.stop();

      assert.deepStrictEqual(
        tracks.map((track) => track.stopped),
        [true, true]
      );
    });

    it("stops the capture interval", async () => {
      const engine = await loadEngine({ tracks: [createTrack()] });

      engine.startStreaming();
      assert.strictEqual(engine.isTicking, true);

      engine.engine.stop();
      assert.strictEqual(engine.isTicking, false);
    });

    it("does not let a late canplay restart capturing", async () => {
      const engine = await loadEngine({ tracks: [createTrack()] });

      // stopped after start() but before the stream ever became ready, so the
      // browser still delivers canplay afterwards
      engine.engine.start();
      engine.engine.stop();
      if (engine.video.listeners.canplay) {
        engine.video.listeners.canplay();
      }

      assert.strictEqual(engine.isTicking, false);
    });

    it("releases the stream so a stopped engine cannot be restarted", async () => {
      const tracks = [createTrack()];
      const engine = await loadEngine({ tracks });

      engine.startStreaming();
      engine.engine.stop();

      // the tracks are dead, so starting again has to go through init rather
      // than silently carrying on with a stream that no longer delivers frames
      assert.strictEqual(engine.video.srcObject, null);
      assert.throws(() => engine.engine.start());
    });

    it("does not throw when the camera was never granted", async () => {
      const engine = await loadEngine({
        getUserMedia: () => Promise.reject(new Error("NotAllowedError")),
      });

      assert.match(String(engine.initError), /NotAllowedError/);
      assert.doesNotThrow(() => engine.engine.stop());
    });
  });

  describe("init", () => {
    it("reports a denied camera through the error callback", async () => {
      const engine = await loadEngine({
        getUserMedia: () => Promise.reject(new Error("NotAllowedError")),
      });

      assert.ok(engine.initError instanceof Error);
    });

    it("refuses to start without a stream", async () => {
      const engine = await loadEngine({
        getUserMedia: () => Promise.reject(new Error("NotAllowedError")),
      });

      assert.throws(() => engine.engine.start());
    });
  });
});
