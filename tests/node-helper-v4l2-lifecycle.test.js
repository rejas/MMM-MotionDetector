const assert = require("node:assert");
const { describe, it } = require("node:test");
const { loadNodeHelper, flush } = require("./node-helper-mock");

const FRAME_SIZE = 160 * 120;

/**
 * @param overrides config overrides merged over a minimal valid V4L2 config
 * @returns {object}
 */
function baseConfig(overrides = {}) {
  return {
    cameraDevice: "/dev/video0",
    captureIntervalTime: 1000,
    scoreThreshold: 20,
    pixelDiffThreshold: 30,
    lightChangeThreshold: 12,
    lightChangePixelRatio: 0.55,
    lightChangeDirectionRatio: 0.8,
    timeout: 120000,
    autoHideOnNoMotion: true,
    ...overrides,
  };
}

describe("node_helper V4L2 ffmpeg lifecycle", () => {
  it("does not claim the camera started until a full frame is produced", async () => {
    const { helper, notifications } = loadNodeHelper();

    helper.startV4L2(baseConfig());
    await flush();

    assert.deepStrictEqual(
      notifications.filter((n) => n.notification === "V4L2_CAMERA_STARTED"),
      []
    );

    helper.v4l2Process.stdout.emit("data", Buffer.alloc(FRAME_SIZE, 0));
    await flush();

    assert.deepStrictEqual(
      notifications.filter((n) => n.notification === "V4L2_CAMERA_STARTED"),
      [{ notification: "V4L2_CAMERA_STARTED", payload: { device: "/dev/video0" } }]
    );
  });

  it("does not resend V4L2_CAMERA_STARTED for later frames", async () => {
    const { helper, notifications } = loadNodeHelper();

    helper.startV4L2(baseConfig());
    const proc = helper.v4l2Process;

    proc.stdout.emit("data", Buffer.alloc(FRAME_SIZE, 0));
    proc.stdout.emit("data", Buffer.alloc(FRAME_SIZE, 0));
    proc.stdout.emit("data", Buffer.alloc(FRAME_SIZE, 0));
    await flush();

    assert.strictEqual(
      notifications.filter((n) => n.notification === "V4L2_CAMERA_STARTED").length,
      1
    );
  });

  it("reports a spawn error via V4L2_CAMERA_ERROR", async () => {
    const { helper, notifications } = loadNodeHelper();

    helper.startV4L2(baseConfig());
    const proc = helper.v4l2Process;

    proc.emit("error", new Error("spawn ENOENT"));
    await flush();

    assert.deepStrictEqual(notifications, [
      { notification: "V4L2_CAMERA_ERROR", payload: { error: "spawn ENOENT" } },
    ]);
  });

  it("reports an unexpected non-zero exit via V4L2_CAMERA_ERROR", async () => {
    const { helper, notifications } = loadNodeHelper();

    helper.startV4L2(baseConfig());
    const proc = helper.v4l2Process;

    proc.emit("exit", 1, null);
    await flush();

    const errors = notifications.filter((n) => n.notification === "V4L2_CAMERA_ERROR");
    assert.strictEqual(errors.length, 1);
    assert.match(errors[0].payload.error, /code=1/);
  });

  it("does not report an error for a controlled SIGTERM during a restart", async () => {
    const { helper, notifications } = loadNodeHelper();

    helper.startV4L2(baseConfig());
    const firstProc = helper.v4l2Process;

    // a second INIT_V4L2 restarts the backend and must kill the old process
    helper.startV4L2(baseConfig());

    assert.deepStrictEqual(firstProc.killSignals, ["SIGTERM"]);

    // simulate the OS actually delivering the signal after the restart
    firstProc.emit("exit", null, "SIGTERM");
    await flush();

    assert.deepStrictEqual(
      notifications.filter((n) => n.notification === "V4L2_CAMERA_ERROR"),
      []
    );
  });

  it("stops the previous ffmpeg process before starting a new one", () => {
    const { helper, spawnCalls } = loadNodeHelper();

    helper.startV4L2(baseConfig());
    helper.startV4L2(baseConfig());

    assert.strictEqual(spawnCalls.length, 2);
    assert.deepStrictEqual(spawnCalls[0].proc.killSignals, ["SIGTERM"]);
    assert.notStrictEqual(helper.v4l2Process, spawnCalls[0].proc);
    assert.strictEqual(helper.v4l2Process, spawnCalls[1].proc);
  });

  it("ignores frames arriving from a process a restart already replaced", async () => {
    const { helper, notifications } = loadNodeHelper();

    helper.startV4L2(baseConfig());
    const staleProc = helper.v4l2Process;

    helper.startV4L2(baseConfig());
    const currentProc = helper.v4l2Process;
    assert.notStrictEqual(staleProc, currentProc);

    staleProc.stdout.emit("data", Buffer.alloc(FRAME_SIZE, 5));
    await flush();

    // the stale process's frame must not be mistaken for the new process's
    // first frame, nor mixed into its buffer
    assert.deepStrictEqual(
      notifications.filter((n) => n.notification === "V4L2_CAMERA_STARTED"),
      []
    );
  });

  it("does not report an error for a late exit event from an already-replaced process", async () => {
    const { helper, notifications } = loadNodeHelper();

    helper.startV4L2(baseConfig());
    const staleProc = helper.v4l2Process;

    helper.startV4L2(baseConfig());
    const currentProc = helper.v4l2Process;

    // the real OS process for staleProc finally exits after being SIGTERM'd
    staleProc.emit("exit", null, "SIGTERM");
    await flush();

    assert.deepStrictEqual(
      notifications.filter((n) => n.notification === "V4L2_CAMERA_ERROR"),
      []
    );
    // the late event from the old process must not clobber the current one
    assert.strictEqual(helper.v4l2Process, currentProc);
  });
});
