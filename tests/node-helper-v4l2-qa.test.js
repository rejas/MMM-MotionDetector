const assert = require("node:assert/strict");
const { it } = require("node:test");
const { loadNodeHelper, flush, createFakeProcess } = require("./node-helper-mock");
const SIZE = 160 * 120;
const config = { timeout: -1, scoreThreshold: 1 };
function setup(overrides = {}, options) {
  const state = loadNodeHelper(options);
  state.helper.platform = "x11";
  state.helper.startV4L2({ ...config, ...overrides });
  state.proc = state.helper.v4l2Process;
  state.send = (frame) => state.proc.stdout.emit("data", frame);
  state.statuses = () =>
    state.notifications.filter((n) => n.notification === "V4L2_MOTION_STATUS").map((n) => n.payload);
  return state;
}
function patch(count, value = 100) {
  const frame = Buffer.alloc(SIZE);
  frame.fill(value, 0, count);
  return frame;
}
for (const split of [SIZE - 1, SIZE, SIZE + 1, SIZE * 2.5]) {
  it(`buffer boundary ${split} preserves every frame byte`, () => {
    const s = setup();
    const frames = [patch(1), patch(27), patch(86), patch(103)];
    const stream = Buffer.concat(frames);
    const received = [];
    s.helper.processV4L2Frame = (frame) => received.push(Buffer.from(frame));
    s.send(stream.subarray(0, split));
    assert.equal(received.length, Math.floor(split / SIZE));
    s.send(stream.subarray(split));
    assert.deepEqual(received, frames);
    assert.equal(s.helper.v4l2FrameBuffer.length, 0);
  });
}
it("single byte chunks retain alignment and trailing bytes", () => {
  const s = setup();
  const frame = Buffer.from(Array.from({ length: SIZE }, (_, i) => i % 251));
  const received = [];
  s.helper.processV4L2Frame = (value) => received.push(Buffer.from(value));
  for (const byte of frame) s.send(Buffer.from([byte]));
  s.send(Buffer.concat([frame, frame.subarray(0, 123)]));
  assert.deepEqual(received, [frame, frame]);
  assert.deepEqual(s.helper.v4l2FrameBuffer, frame.subarray(0, 123));
  s.send(frame.subarray(123));
  assert.deepEqual(received, [frame, frame, frame]);
});
for (const [label, value, minimum] of [
  ["undefined", undefined, 20],
  ["null", null, 20],
  ["NaN", NaN, 20],
  ["zero", 0, 1],
  ["one", 1, 1],
  ["negative", -2, 1],
  ["string zero", "0", 1],
  ["string twenty", "20", 20]
]) {
  it(`score normalization ${label} observes the motion boundary`, () => {
    for (const count of [0, 1, 19, 20, 21]) {
      const s = setup({ scoreThreshold: value });
      s.send(Buffer.alloc(SIZE));
      s.send(patch(count));
      assert.equal(s.statuses()[0].score, count);
      assert.equal(s.statuses()[0].hasMotion, count >= minimum);
    }
  });
}
for (const value of [0, "0"]) {
  it(`pixel zero ${typeof value} counts only changed pixels`, () => {
    const s = setup({ pixelDiffThreshold: value });
    s.send(Buffer.alloc(SIZE));
    s.send(patch(1, 1));
    s.send(patch(1, 1));
    assert.deepEqual(
      s.statuses().map((n) => [n.score, n.hasMotion]),
      [
        [1, true],
        [0, false]
      ]
    );
  });
}
for (const [field, threshold, makeFrame] of [
  ["lightChangeThreshold", 40, () => Buffer.alloc(SIZE, 40)],
  ["lightChangePixelRatio", 0.5, () => patch(SIZE / 2, 100)],
  [
    "lightChangeDirectionRatio",
    0.8,
    () => {
      const b = Buffer.alloc(SIZE, 0);
      b.fill(200, 0, SIZE * 0.8);
      return b;
    }
  ]
]) {
  for (const [offset, filtered] of [
    [-0.000001, true],
    [0, true],
    [0.000001, false]
  ]) {
    it(`light boundary ${field} offset ${offset}`, () => {
      const s = setup({
        lightChangeThreshold: 1,
        lightChangePixelRatio: 0.1,
        lightChangeDirectionRatio: 0.5,
        [field]: threshold + offset
      });
      s.send(Buffer.alloc(SIZE, field === "lightChangeDirectionRatio" ? 100 : 0));
      s.send(makeFrame());
      assert.equal(s.statuses().length, filtered ? 0 : 1);
      if (!filtered) assert.equal(s.statuses()[0].hasMotion, true);
    });
  }
}
it("local strong movement is not a global light event", () => {
  const s = setup();
  s.send(Buffer.alloc(SIZE));
  s.send(patch(500, 255));
  assert.equal(s.statuses()[0].hasMotion, true);
});
for (const timeout of [-1, 0, "100"]) {
  it(`timeout ${timeout} is bounded and toggles only once per transition`, async (t) => {
    let now = 1000;
    t.mock.method(Date, "now", () => now);
    const s = setup({ timeout });
    s.send(Buffer.alloc(SIZE));
    now += 1000;
    for (let i = 0; i < 4; i++) s.send(Buffer.alloc(SIZE));
    await flush();
    assert.equal(s.commands.filter((c) => c.endsWith(" off")).length, timeout === -1 ? 0 : 1);
    for (let i = 1; i <= 4; i++) s.send(patch(i));
    await flush();
    assert.equal(s.commands.filter((c) => c.endsWith(" on")).length, timeout === -1 ? 0 : 1);
  });
}
it("motion exactly at timeout boundary renews the deadline", async (t) => {
  let now = 1000;
  t.mock.method(Date, "now", () => now);
  const s = setup({ timeout: 100 });
  s.send(Buffer.alloc(SIZE));
  now = 1100;
  s.send(patch(1));
  now = 1200;
  s.send(patch(1));
  await flush();
  assert.equal(s.commands.length, 0);
  now = 1201;
  s.send(patch(1));
  await flush();
  assert.equal(s.commands.length, 1);
});
it("explicit auto hide false disables automatic off", async (t) => {
  t.mock.method(Date, "now", () => 1000);
  const s = setup({ timeout: 0, autoHideOnNoMotion: false });
  s.send(Buffer.alloc(SIZE));
  s.helper.v4l2LastMotionAt = 0;
  s.send(Buffer.alloc(SIZE));
  await flush();
  assert.equal(s.commands.length, 0);
});
for (const afterFrame of [false, true]) {
  for (const kind of ["error", "exit", "signal", "clean exit"]) {
    it(`camera failure ${kind} after frame ${afterFrame}`, () => {
      const s = setup();
      if (afterFrame) s.send(Buffer.alloc(SIZE));
      if (kind === "error") s.proc.emit("error", new Error("camera unavailable"));
      else
        s.proc.emit(
          "exit",
          kind === "exit" ? 1 : kind === "clean exit" ? 0 : null,
          kind === "signal" ? "SIGKILL" : null
        );
      assert.equal(s.notifications.filter((n) => n.notification === "V4L2_CAMERA_ERROR").length, 1);
    });
  }
}
it("QA-01 late error after restart cannot corrupt the new camera", () => {
  const s = setup();
  const old = s.proc;
  s.helper.socketNotificationReceived("INIT_V4L2", config);
  old.emit("exit", null, "SIGTERM");
  const current = s.helper.v4l2Process;
  old.emit("error", new Error("late camera failure"));
  old.stdout.emit("data", Buffer.alloc(SIZE));
  assert.equal(s.helper.v4l2Process, current);
  assert.equal(s.notifications.length, 0);
  current.stdout.emit("data", Buffer.alloc(SIZE));
  assert.deepEqual(
    s.notifications.map((n) => n.notification),
    ["V4L2_CAMERA_STARTED"]
  );
});
it("QA-01 error followed by exit reports only one camera failure", () => {
  const s = setup();
  s.proc.emit("error", new Error("camera failure"));
  s.proc.emit("exit", 1, null);
  assert.equal(s.notifications.filter((n) => n.notification === "V4L2_CAMERA_ERROR").length, 1);
});
it("QA-02 status reflects off and wake in the same frame", async (t) => {
  let now = 1000;
  t.mock.method(Date, "now", () => now);
  const s = setup({ timeout: 100 });
  s.send(Buffer.alloc(SIZE));
  now = 1200;
  s.send(Buffer.alloc(SIZE));
  await flush();
  assert.equal(s.statuses().at(-1).monitorOn, false);
  now = 1500;
  s.send(patch(1));
  await flush();
  assert.equal(s.statuses().at(-1).monitorOn, true);
});
it("QA-03 camera restart while off preserves the ability to wake", async () => {
  const s = setup();
  s.helper.v4l2MonitorOn = false;
  s.helper.startV4L2(config);
  s.proc.emit("exit", null, "SIGTERM");
  const current = s.helper.v4l2Process;
  current.stdout.emit("data", Buffer.alloc(SIZE));
  current.stdout.emit("data", patch(1));
  await flush();
  assert.equal(s.commands.filter((c) => c.endsWith(" on")).length, 1);
});
it("QA-04 replacement waits for camera process termination", () => {
  const proc = createFakeProcess();
  proc.kill = (signal) => {
    proc.killSignals.push(signal);
    return true;
  };
  const processes = [proc, createFakeProcess()];
  const s = setup({}, { spawn: () => processes.shift() });
  s.helper.socketNotificationReceived("INIT_V4L2", { ...config, cameraDevice: "/dev/video1" });
  s.helper.socketNotificationReceived("INIT_V4L2", { ...config, cameraDevice: "/dev/video2" });
  assert.equal(s.spawnCalls.length, 1);
  proc.stdout.emit("data", Buffer.alloc(SIZE));
  assert.equal(s.notifications.length, 0);
  proc.emit("exit", null, "SIGTERM");
  assert.equal(s.spawnCalls.length, 2);
  assert.ok(s.spawnCalls[1].args.includes("/dev/video2"));
});
it("QA-05 stale monitor rejection cannot overwrite a newer off request", async () => {
  let rejectWake;
  const s = setup(
    { timeout: 0 },
    {
      run: (command) =>
        command.endsWith(" on")
          ? new Promise((resolve, reject) => {
              rejectWake = reject;
            })
          : { stdout: "" }
    }
  );
  s.helper.v4l2MonitorOn = false;
  s.send(Buffer.alloc(SIZE));
  s.send(patch(1));
  s.helper.v4l2LastMotionAt = 0;
  s.send(patch(1));
  rejectWake(new Error("monitor unavailable"));
  await flush();
  assert.equal(s.helper.v4l2MonitorOn, false);
});
it("QA-05 old off rejection cannot overwrite the latest queued off", async () => {
  let rejectOff;
  let first = true;
  const s = setup(
    { timeout: 0 },
    {
      run: (command) => {
        if (first && command.endsWith(" off")) {
          first = false;
          return new Promise((resolve, reject) => {
            rejectOff = reject;
          });
        }
        return { stdout: "" };
      }
    }
  );
  s.send(Buffer.alloc(SIZE));
  s.helper.v4l2LastMotionAt = 0;
  s.send(Buffer.alloc(SIZE));
  s.send(patch(1));
  s.helper.v4l2LastMotionAt = 0;
  s.send(patch(1));
  rejectOff(new Error("monitor unavailable"));
  await flush();
  assert.equal(s.helper.v4l2MonitorOn, false);
});
it("QA-06 helper shutdown releases the active camera", () => {
  const s = setup();
  assert.equal(typeof s.helper.stop, "function");
  s.helper.stop();
  assert.deepEqual(s.proc.killSignals, ["SIGTERM"]);
  s.proc.emit("exit", null, "SIGTERM");
  assert.equal(s.helper.v4l2Process, null);
  assert.equal(s.notifications.length, 0);
});
it("browser and helper status stream book identical off intervals", async (t) => {
  const { loadModule } = require("./module-mock");
  let now = 1000;
  t.mock.method(Date, "now", () => now);
  class Clock extends Date {
    constructor(value = now) {
      super(value);
    }
  }
  const browser = loadModule({ timeout: 100 }, Clock);
  const remote = loadModule({ cameraBackend: "v4l2", timeout: 100 }, Clock);
  const s = setup({ timeout: 100 });
  s.helper.sendSocketNotification = (name, payload) => remote.module.socketNotificationReceived(name, payload);
  s.send(Buffer.alloc(SIZE));
  for (const [time, count, motion, off, total, percent] of [
    [1200, 0, false, true, 0, "0.00"],
    [1500, 0, false, true, 0, "60.00"],
    [1700, 1, true, false, 500, "71.43"],
    [1800, 2, true, false, 500, "62.50"],
    [2000, 2, false, true, 500, "50.00"],
    [2100, 2, false, true, 500, "54.55"],
    [2300, 3, true, false, 800, "61.54"]
  ]) {
    now = time;
    browser.capture({ score: motion ? 1 : 0, hasMotion: motion });
    s.send(patch(count));
    await flush();
    for (const module of [browser.module, remote.module]) {
      assert.equal(module.poweredOff, off);
      assert.equal(module.poweredOffTime, total);
      assert.equal(module.percentagePoweredOff, percent);
    }
  }
});
it("hidden V4L2 module does not update DOM or send monitor sockets per frame", () => {
  const { loadModule } = require("./module-mock");
  const { module } = loadModule({ cameraBackend: "v4l2" });
  module.data.position = null;
  let updates = 0;
  module.updateDom = () => updates++;
  for (let i = 0; i < 100; i++)
    module.socketNotificationReceived("V4L2_MOTION_STATUS", { score: 0, hasMotion: false, monitorOn: true });
  assert.equal(updates, 0);
  assert.equal(module.notifications.length, 0);
});
it("delayed stop escalates once and never starts a concurrent camera", (t) => {
  t.mock.timers.enable({ apis: ["setTimeout"] });
  const proc = createFakeProcess();
  proc.kill = (signal) => {
    proc.killSignals.push(signal);
    return true;
  };
  const processes = [proc, createFakeProcess()];
  const s = setup({}, { spawn: () => processes.shift() });
  s.helper.startV4L2(config);
  t.mock.timers.tick(2000);
  assert.deepEqual(proc.killSignals, ["SIGTERM", "SIGKILL"]);
  assert.equal(s.spawnCalls.length, 1);
  proc.emit("exit", null, "SIGKILL");
  assert.equal(s.spawnCalls.length, 2);
  t.mock.timers.tick(2000);
  assert.deepEqual(proc.killSignals, ["SIGTERM", "SIGKILL"]);
});
it("shutdown cancels a queued restart while the camera is stopping", () => {
  const proc = createFakeProcess();
  proc.kill = (signal) => {
    proc.killSignals.push(signal);
    return true;
  };
  const s = setup({}, { spawn: () => proc });
  s.helper.startV4L2(config);
  s.helper.stop();
  proc.emit("exit", null, "SIGTERM");
  assert.equal(s.spawnCalls.length, 1);
  assert.equal(s.helper.v4l2Process, null);
});
it("failed spawn closes before the pending replacement starts", () => {
  const proc = createFakeProcess();
  proc.kill = (signal) => {
    proc.killSignals.push(signal);
    return false;
  };
  const processes = [proc, createFakeProcess()];
  const s = setup({}, { spawn: () => processes.shift() });
  proc.emit("error", new Error("camera unavailable"));
  s.helper.startV4L2(config);
  assert.equal(s.spawnCalls.length, 1);
  proc.emit("close", -1, null);
  assert.equal(s.spawnCalls.length, 2);
  assert.equal(s.notifications.filter((n) => n.notification === "V4L2_CAMERA_ERROR").length, 1);
});
for (const phase of ["light", "stabilization"]) {
  it(`QA-07 ${phase} filtering does not suspend the inactivity timeout`, async (t) => {
    let now = 1000;
    t.mock.method(Date, "now", () => now);
    const s = setup({ timeout: 100 });
    s.send(Buffer.alloc(SIZE));
    now = phase === "light" ? 1200 : 1050;
    s.send(Buffer.alloc(SIZE, 50));
    if (phase === "stabilization") {
      now = 1200;
      s.send(Buffer.alloc(SIZE, 50));
    }
    await flush();
    assert.equal(s.commands.filter((c) => c.endsWith(" off")).length, 1);
    assert.equal(s.statuses().at(-1).monitorOn, false);
    assert.equal(s.statuses().at(-1).hasMotion, false);
  });
}
