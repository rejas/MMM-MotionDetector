const assert = require("node:assert");
const { describe, it } = require("node:test");
const { loadNodeHelper, flush } = require("./node-helper-mock");

const FRAME_WIDTH = 160;
const FRAME_HEIGHT = 120;
const FRAME_SIZE = FRAME_WIDTH * FRAME_HEIGHT;

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

/**
 * A frame filled uniformly with one brightness value.
 * @param value 0-255
 * @returns {Buffer}
 */
function solidFrame(value) {
  return Buffer.alloc(FRAME_SIZE, value);
}

/**
 * A frame filled with a base brightness except for a small patch, so only
 * `patchPixels` pixels actually change relative to another frame built with
 * the same base but a different patch value. Keeping the patch small (well
 * under the default 55% lightChangePixelRatio) means it is always local
 * motion, never a global light change.
 * @param base background brightness (0-255)
 * @param patchValue brightness of the patch (0-255)
 * @param patchPixels how many leading pixels get the patch value
 * @returns {Buffer}
 */
function frameWithPatch(base, patchValue, patchPixels) {
  const buf = Buffer.alloc(FRAME_SIZE, base);
  buf.fill(patchValue, 0, patchPixels);
  return buf;
}

function send(proc, buffer) {
  proc.stdout.emit("data", buffer);
}

/**
 * Start the V4L2 backend and feed it one bootstrap frame (which never itself
 * produces a V4L2_MOTION_STATUS, it only seeds "previous frame"), discarding
 * the resulting V4L2_CAMERA_STARTED notification.
 * @param overrides config overrides
 * @returns {Promise<{helper: object, proc: object, notifications: object[], logs: object, commands: string[]}>}
 */
async function startAndPrime(overrides = {}) {
  const { helper, notifications, logs, commands } = loadNodeHelper();

  helper.platform = "x11";
  helper.startV4L2(baseConfig(overrides));
  const proc = helper.v4l2Process;

  send(proc, solidFrame(0));
  await flush();
  notifications.length = 0;

  return { helper, proc, notifications, logs, commands };
}

function motionStatuses(notifications) {
  return notifications.filter((n) => n.notification === "V4L2_MOTION_STATUS");
}

describe("node_helper V4L2 frame buffering", () => {
  it("buffers a partial frame without processing it", async () => {
    const { helper, notifications } = loadNodeHelper();

    helper.startV4L2(baseConfig());
    send(helper.v4l2Process, solidFrame(0).subarray(0, 100));
    await flush();

    assert.deepStrictEqual(notifications, []);
  });

  it("processes exactly one frame delivered as a single complete chunk", async () => {
    const { proc, notifications } = await startAndPrime({ scoreThreshold: 1 });

    send(proc, frameWithPatch(0, 200, 30));
    await flush();

    assert.strictEqual(motionStatuses(notifications).length, 1);
    assert.strictEqual(motionStatuses(notifications)[0].payload.score, 30);
  });

  it("processes multiple frames delivered together in one chunk, in order", async () => {
    const { proc, notifications } = await startAndPrime({ scoreThreshold: 1 });

    // frame A: 10 pixels patched vs. the all-zero baseline
    // frame B: a further 5 pixels patched vs. frame A
    const frameA = frameWithPatch(0, 200, 10);
    const frameB = frameWithPatch(0, 200, 15);
    send(proc, Buffer.concat([frameA, frameB]));
    await flush();

    const statuses = motionStatuses(notifications);
    assert.strictEqual(statuses.length, 2);
    assert.strictEqual(statuses[0].payload.score, 10);
    assert.strictEqual(statuses[1].payload.score, 5);
  });

  it("processes a frame split across multiple chunks without shifting or mixing bytes", async () => {
    const { proc, notifications } = await startAndPrime({ scoreThreshold: 1 });

    const frame = frameWithPatch(0, 200, 42);
    send(proc, frame.subarray(0, 50));
    await flush();
    assert.deepStrictEqual(notifications, [], "must not process before the full frame arrived");

    send(proc, frame.subarray(50));
    await flush();

    const statuses = motionStatuses(notifications);
    assert.strictEqual(statuses.length, 1);
    assert.strictEqual(statuses[0].payload.score, 42);
  });
});

describe("node_helper V4L2 motion threshold semantics", () => {
  it("scoreThreshold 0 + score 0 -> no motion", async () => {
    const { proc, notifications } = await startAndPrime({ scoreThreshold: 0 });

    send(proc, solidFrame(0)); // perfectly unchanged frame
    await flush();

    const status = motionStatuses(notifications)[0];
    assert.strictEqual(status.payload.score, 0);
    assert.strictEqual(status.payload.hasMotion, false);
  });

  it("scoreThreshold 0 + score > 0 -> motion", async () => {
    const { proc, notifications } = await startAndPrime({ scoreThreshold: 0 });

    send(proc, frameWithPatch(0, 200, 5));
    await flush();

    const status = motionStatuses(notifications)[0];
    assert.strictEqual(status.payload.score, 5);
    assert.strictEqual(status.payload.hasMotion, true);
  });

  it("scoreThreshold 20 + score < 20 -> no motion", async () => {
    const { proc, notifications } = await startAndPrime({ scoreThreshold: 20 });

    send(proc, frameWithPatch(0, 200, 19));
    await flush();

    assert.strictEqual(motionStatuses(notifications)[0].payload.hasMotion, false);
  });

  it("scoreThreshold 20 + score == 20 -> motion, matching upstream DiffCamEngine semantics", async () => {
    const { proc, notifications } = await startAndPrime({ scoreThreshold: 20 });

    send(proc, frameWithPatch(0, 200, 20));
    await flush();

    assert.strictEqual(motionStatuses(notifications)[0].payload.hasMotion, true);
  });
});

describe("node_helper V4L2 global light-change filter", () => {
  it("ignores a global brightness change in the same direction", async () => {
    const { proc, notifications } = await startAndPrime();

    send(proc, solidFrame(50)); // every pixel brighter by the same amount
    await flush();

    assert.deepStrictEqual(motionStatuses(notifications), []);
  });

  it("also ignores the stabilization frame right after a light change", async () => {
    const { proc, notifications } = await startAndPrime();

    send(proc, solidFrame(50)); // light change, ignored
    await flush();
    send(proc, frameWithPatch(50, 250, 30)); // stabilization frame, ignored too
    await flush();

    assert.deepStrictEqual(motionStatuses(notifications), []);
  });

  it("reports real motion again once the stabilization frame has passed", async () => {
    const { proc, notifications } = await startAndPrime({ scoreThreshold: 1 });

    send(proc, solidFrame(50)); // light change
    send(proc, frameWithPatch(50, 250, 30)); // stabilization frame, becomes the new previous frame
    // a further, larger patch so this frame actually differs from the one above
    send(proc, frameWithPatch(50, 250, 60));
    await flush();

    const statuses = motionStatuses(notifications);
    assert.strictEqual(statuses.length, 1);
    assert.strictEqual(statuses[0].payload.hasMotion, true);
    assert.strictEqual(statuses[0].payload.score, 30);
  });

  it("does not classify localized motion as a light change", async () => {
    const { proc, notifications } = await startAndPrime({ scoreThreshold: 1 });

    send(proc, frameWithPatch(0, 200, 30)); // small patch, far below lightChangePixelRatio
    await flush();

    const status = motionStatuses(notifications)[0];
    assert.ok(status, "expected a motion status, not a suppressed light change");
    assert.strictEqual(status.payload.hasMotion, true);
  });
});

describe("node_helper V4L2 timeout and wake", () => {
  it("keeps the monitor on before the timeout elapses", async () => {
    const { helper, proc, commands } = await startAndPrime({ timeout: 100000 });
    helper.v4l2LastMotionAt = Date.now() - 1000;

    send(proc, solidFrame(0));
    await flush();

    assert.deepStrictEqual(commands, []);
    assert.strictEqual(helper.v4l2MonitorOn, true);
  });

  it("deactivates the monitor once the timeout elapses without motion", async () => {
    const { helper, proc, commands } = await startAndPrime({ timeout: 1000 });
    helper.v4l2LastMotionAt = Date.now() - 5000;

    send(proc, solidFrame(0));
    await flush();

    assert.ok(commands.some((c) => c.endsWith("sh off")));
    assert.strictEqual(helper.v4l2MonitorOn, false);
  });

  it("does not repeat the off command on further quiet frames", async () => {
    const { helper, proc, commands } = await startAndPrime({ timeout: 1000 });
    helper.v4l2LastMotionAt = Date.now() - 5000;

    send(proc, solidFrame(0));
    await flush();
    commands.length = 0;

    send(proc, solidFrame(0));
    send(proc, solidFrame(0));
    await flush();

    assert.deepStrictEqual(commands, []);
  });

  it("activates the monitor once motion resumes after being powered off", async () => {
    const { helper, proc, commands } = await startAndPrime({ timeout: 1000, scoreThreshold: 1 });
    helper.v4l2LastMotionAt = Date.now() - 5000;

    send(proc, solidFrame(0));
    await flush();
    assert.strictEqual(helper.v4l2MonitorOn, false);

    commands.length = 0;
    send(proc, frameWithPatch(0, 200, 30));
    await flush();

    assert.ok(commands.some((c) => c.endsWith("sh on")));
    assert.strictEqual(helper.v4l2MonitorOn, true);
  });

  it("never powers off for a negative timeout", async () => {
    const { helper, proc, commands } = await startAndPrime({ timeout: -1 });
    helper.v4l2LastMotionAt = Date.now() - 24 * 60 * 60 * 1000;

    send(proc, solidFrame(0));
    await flush();

    assert.deepStrictEqual(commands, []);
    assert.strictEqual(helper.v4l2MonitorOn, true);
  });

  it("updates lastMotionAt only on frames with motion", async () => {
    const { helper, proc } = await startAndPrime({ scoreThreshold: 1 });
    helper.v4l2LastMotionAt = Date.now() - 10000;
    const before = helper.v4l2LastMotionAt;

    send(proc, solidFrame(0)); // no motion
    await flush();
    assert.strictEqual(helper.v4l2LastMotionAt, before);

    send(proc, frameWithPatch(0, 200, 30)); // motion
    await flush();
    assert.ok(helper.v4l2LastMotionAt > before);
  });
});

describe("node_helper V4L2 config normalization", () => {
  it("treats pixelDiffThreshold 0 as counting any real change, not every pixel", async () => {
    const { proc, notifications } = await startAndPrime({ pixelDiffThreshold: 0, scoreThreshold: 1 });

    send(proc, frameWithPatch(0, 5, 10)); // only 10 pixels actually differ from the baseline
    await flush();

    assert.strictEqual(motionStatuses(notifications)[0].payload.score, 10);
  });

  it("falls back to the default interval when captureIntervalTime is not a number", () => {
    const { helper, spawnCalls } = loadNodeHelper();

    helper.startV4L2(baseConfig({ captureIntervalTime: "not-a-number" }));

    const args = spawnCalls[0].args;
    const vf = args[args.indexOf("-vf") + 1];
    assert.match(vf, /^fps=1,/); // 1000ms default -> 1 fps
  });

  it("keeps an explicit captureIntervalTime of 0, clamped to the 200ms floor instead of the default", () => {
    const { helper, spawnCalls } = loadNodeHelper();

    helper.startV4L2(baseConfig({ captureIntervalTime: 0 }));

    const args = spawnCalls[0].args;
    const vf = args[args.indexOf("-vf") + 1];
    assert.match(vf, /^fps=5,/); // clamped to the 200ms floor -> 5 fps, not the 1000ms default
  });
});
