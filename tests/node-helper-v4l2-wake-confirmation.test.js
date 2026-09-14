const assert = require("node:assert/strict");
const { it } = require("node:test");
const { loadNodeHelper, flush } = require("./node-helper-mock");
const { loadModule } = require("./module-mock");

const SIZE = 160 * 120;
// mid-grey, so a person can differ from it in both directions
const baseline = Buffer.alloc(SIZE, 110);

async function setup(t, first, { off = true, config = {} } = {}) {
  let now = 1000;
  t.mock.method(Date, "now", () => now);
  const state = loadNodeHelper();
  state.config = { timeout: 1000, scoreThreshold: 20, captureIntervalTime: 1000, ...config };
  state.helper.platform = "x11";
  state.helper.startV4L2(state.config);
  t.after(() => state.helper.stop());
  state.send = async (frame, elapsed = 1000) => {
    now += elapsed;
    state.helper.v4l2Process.stdout.emit("data", frame);
    await flush();
  };
  await state.send(first, 0);
  if (off) {
    await state.send(first, 2000);
    assert.equal(state.helper.v4l2MonitorOn, false, "fixture must reach OFF through the regular timeout");
  }
  state.notifications.length = 0;
  state.onCount = () => state.commands.filter((command) => command.endsWith(" on")).length;
  state.offCount = () => state.commands.filter((command) => command.endsWith(" off")).length;
  state.statuses = () =>
    state.notifications.filter((item) => item.notification === "V4L2_MOTION_STATUS").map((item) => item.payload);
  state.motion = () => state.statuses().filter((payload) => payload.hasMotion);
  // cumulative ON commands after each delivered frame
  state.run = async (frames, elapsed) => {
    const trace = [];
    for (const frame of frames) {
      await state.send(frame, elapsed);
      trace.push(state.onCount());
    }
    return trace;
  };
  return state;
}

// A person is textured, some pixels brighter and some darker than the background.
// A uniform bright block would be indistinguishable from a light change.
function person(base, from, to) {
  const frame = Buffer.from(base);
  for (let i = from; i < to; i++) frame[i] = i % 2 ? 230 : 0;
  return frame;
}

// Three local regions; moving between them changes pixels in both directions,
// so a walking person never satisfies the one-direction light criterion.
const r0 = person(baseline, 0, 7000);
const r1 = person(baseline, 7000, 14000);
const r2 = person(baseline, 14000, SIZE);

// light on brightens every level, light off is the same ramp mirrored
function rampFrame(direction, fill) {
  const buffer = Buffer.alloc(SIZE);
  for (let i = 0; i < SIZE; i++) buffer[i] = direction === "on" ? fill(i) : 255 - fill(i);
  return buffer;
}

// Reconstructed dark-room auto exposure: the camera needs several frames before a
// frame differs globally enough for the light filter. First steps match the Pi log.
function nightRamp(direction, firstChanged = 6532) {
  return {
    a: rampFrame(direction, () => 8),
    b: rampFrame(direction, (i) => (i < firstChanged ? 48 : 8)),
    c: rampFrame(direction, (i) => (i < 8640 ? 88 : 8)),
    lit: rampFrame(direction, () => 128)
  };
}

// Every step stays below the brightness criterion of the wake light classification
// (34 % of the pixels at 33 is an average of 11.2), so only the confirmation window
// can catch the global step that follows on the third frame after the candidate.
function slowRamp(direction) {
  return {
    a: rampFrame(direction, () => 8),
    b: rampFrame(direction, (i) => (i < 6532 ? 41 : 8)),
    c: rampFrame(direction, (i) => (i < 8640 ? 41 : 8)),
    d: rampFrame(direction, (i) => (i < 9984 ? 41 : 8)),
    e: rampFrame(direction, () => 168)
  };
}

for (const direction of ["on", "off"]) {
  for (const firstChanged of [6532, 6734]) {
    it(`night light ${direction}: ${firstChanged} pixel exposure ramp keeps the monitor off`, async (t) => {
      const { a, b, c, lit } = nightRamp(direction, firstChanged);
      const s = await setup(t, a);
      // B candidate (34-35 %), C partial step (45 %), D global light, E stabilization, F steady
      const trace = await s.run([b, c, lit, lit, lit]);
      assert.deepEqual(trace, [0, 0, 0, 0, 0], "a partial exposure step must not release the pending wake");
      assert.equal(s.helper.v4l2MonitorOn, false);
      assert.equal(s.motion().length, 0);
    });
  }

  it(`slow light ${direction}: light confirmed on the last window frame still discards the wake`, async (t) => {
    const { a, b, c, d, e } = slowRamp(direction);
    const s = await setup(t, a);
    // B candidate (34 %), C and D small steps, E global light on the third window frame, then stabilization
    const trace = await s.run([b, c, d, e, e, e]);
    assert.deepEqual(trace, [0, 0, 0, 0, 0, 0]);
    assert.equal(s.helper.v4l2MonitorOn, false);
    assert.equal(s.motion().length, 0);
  });

  it(`slow light ${direction}: a two frame window releases before that late classification`, async (t) => {
    const { a, b, c, d } = slowRamp(direction);
    const s = await setup(t, a, { config: { wakeConfirmationFrames: 2 } });
    const trace = await s.run([b, c, d]);
    assert.deepEqual(trace, [0, 0, 1], "the window must end after exactly wakeConfirmationFrames follow-up frames");
  });

  it(`night light ${direction}: small real motion after the stabilization wakes immediately`, async (t) => {
    const { a, b, c, lit } = nightRamp(direction);
    const s = await setup(t, a);
    const small = Buffer.from(lit);
    for (let i = 0; i < 100; i++) small[i] += direction === "on" ? 60 : -60;
    const trace = await s.run([b, c, lit, lit, small]);
    assert.deepEqual(trace, [0, 0, 0, 0, 1]);
    assert.equal(s.motion().length, 1);
    assert.equal(s.motion()[0].score, 100);
  });

  it(`night light ${direction}: large real motion after the stabilization pends and then wakes`, async (t) => {
    const { a, b, c, lit } = nightRamp(direction);
    const s = await setup(t, a);
    const big = person(lit, 0, 7000);
    const trace = await s.run([b, c, lit, lit, big, big, big, big, big]);
    assert.deepEqual(trace, [0, 0, 0, 0, 0, 0, 0, 1, 1]);
    assert.equal(s.motion().length, 1, "the identical frame after the wake carries no further motion");
  });
}

it("small local motion below the ratio wakes on the same frame", async (t) => {
  const s = await setup(t, baseline);
  const trace = await s.run([person(baseline, 0, 500)]);
  assert.deepEqual(trace, [1]);
  assert.equal(s.motion().length, 1);
  assert.equal(s.motion()[0].score, 500);
});

for (const [pixels, expected] of [
  [4799, [1, 1, 1, 1]],
  [4800, [0, 0, 0, 1]]
]) {
  it(`default ratio boundary at ${pixels} changed pixels`, async (t) => {
    const s = await setup(t, baseline);
    const frame = person(baseline, 0, pixels);
    assert.deepEqual(await s.run([frame, frame, frame, frame]), expected);
  });
}

it("large moving person pends for three frames and wakes exactly once", async (t) => {
  const s = await setup(t, baseline);
  const trace = await s.run([r0, r1, r2, r0]);
  assert.deepEqual(trace, [0, 0, 0, 1]);
  assert.equal(s.motion().length, 1);
  assert.equal(s.motion()[0].score, 14000, "the strongest score seen in the window is reported");
  assert.ok(
    s
      .statuses()
      .slice(0, 3)
      .every((payload) => payload.monitorOn === false && payload.hasMotion === false),
    "window frames must not report motion or an awake monitor"
  );
});

it("large motion followed by a person standing still is not lost", async (t) => {
  const s = await setup(t, baseline);
  const trace = await s.run([r0, r0, r0, r0]);
  assert.deepEqual(trace, [0, 0, 0, 1]);
  assert.equal(s.motion()[0].score, 7000);
  assert.equal(s.helper.v4l2MonitorOn, true);
});

it("continuous strong motion produces exactly one wake", async (t) => {
  const s = await setup(t, baseline);
  const trace = await s.run([r0, r1, r2, r0, r1, r2, r0, r1]);
  assert.deepEqual(trace, [0, 0, 0, 1, 1, 1, 1, 1]);
});

for (const interval of [200, 1000, 2000]) {
  it(`default window adds exactly three ${interval} ms capture cycles`, async (t) => {
    const s = await setup(t, baseline, { config: { captureIntervalTime: interval } });
    await s.send(r0, interval);
    const candidateAt = Date.now();
    const trace = await s.run([r0, r0, r0], interval);
    assert.deepEqual(trace, [0, 0, 1]);
    assert.equal(s.helper.v4l2LastMotionAt - candidateAt, 3 * interval);
  });
}

it("the window neither extends the timeout nor repeats OFF", async (t) => {
  const s = await setup(t, baseline);
  const lastMotionBefore = s.helper.v4l2LastMotionAt;
  const offBefore = s.offCount();
  await s.run([r0, r0, r0]);
  assert.equal(s.helper.v4l2LastMotionAt, lastMotionBefore, "window frames are not motion yet");
  assert.equal(s.offCount(), offBefore);
  await s.send(r0);
  assert.equal(s.helper.v4l2LastMotionAt, Date.now());
  await s.send(r0, 2000);
  await s.send(r0, 2000);
  assert.equal(s.offCount(), offBefore + 1, "the regular timeout switches off exactly once after the wake");
});

it("large motion while the monitor is on is reported immediately", async (t) => {
  const s = await setup(t, baseline, { off: false, config: { timeout: -1 } });
  await s.send(r0);
  assert.equal(s.motion().length, 1);
  assert.equal(s.helper.v4l2LastMotionAt, Date.now());
});

for (const ending of ["restart", "error", "exit", "close", "stop"]) {
  it(`pending wake does not survive camera ${ending}`, async (t) => {
    const s = await setup(t, baseline);
    await s.send(r0);
    assert.equal(s.onCount(), 0);
    const proc = s.helper.v4l2Process;
    if (ending === "error") {
      proc.emit("error", new Error("camera unavailable"));
      proc.emit("close", -1, null);
    }
    if (ending === "exit") proc.emit("exit", 1, null);
    if (ending === "close") proc.emit("close", -1, null);
    if (ending === "stop") s.helper.stop();
    s.helper.startV4L2(s.config);
    assert.notEqual(s.helper.v4l2Process, proc);
    assert.deepEqual(await s.run([baseline, baseline, baseline, baseline, baseline]), [0, 0, 0, 0, 0]);
    assert.equal(s.helper.v4l2MonitorOn, false);
  });
}

async function wakeFrame(t, config, frame = r0) {
  const s = await setup(t, baseline, { config });
  const trace = await s.run([frame, frame, frame, frame, frame, frame]);
  return trace.indexOf(1);
}

for (const [value, expected] of [
  [1, 1],
  [2, 2],
  ["2", 2],
  [3, 3],
  [4, 4]
]) {
  it(`wakeConfirmationFrames ${JSON.stringify(value)} wakes on follow-up frame ${expected}`, async (t) => {
    assert.equal(await wakeFrame(t, { wakeConfirmationFrames: value }), expected);
  });
}

for (const value of [0, -1, 2.5, NaN, Infinity, "abc", null, undefined]) {
  it(`invalid wakeConfirmationFrames ${String(value)} falls back to 3`, async (t) => {
    assert.equal(await wakeFrame(t, { wakeConfirmationFrames: value }), 3);
  });
}

for (const value of [0.5, "0.5", 1]) {
  it(`wakeConfirmationPixelRatio ${JSON.stringify(value)} lets a 36 % change wake immediately`, async (t) => {
    assert.equal(await wakeFrame(t, { wakeConfirmationPixelRatio: value }), 0);
  });
}

for (const value of [-0.1, 1.5, NaN, Infinity, "abc", null]) {
  it(`invalid wakeConfirmationPixelRatio ${String(value)} falls back to 0.25`, async (t) => {
    assert.equal(await wakeFrame(t, { wakeConfirmationPixelRatio: value }), 3);
  });
}

it("wakeConfirmationPixelRatio 0 confirms every wake candidate", async (t) => {
  assert.equal(await wakeFrame(t, { wakeConfirmationPixelRatio: 0 }, person(baseline, 0, 500)), 3);
});

it("module defaults the wake confirmation options and forwards them to the helper", () => {
  const { module } = loadModule({ cameraBackend: "v4l2" });
  assert.equal(module.config.wakeConfirmationPixelRatio, 0.25);
  assert.equal(module.config.wakeConfirmationFrames, 3);
  module.start();
  const init = module.notifications.find(([bus, name]) => bus === "socket" && name === "INIT_V4L2");
  assert.equal(init[2].wakeConfirmationPixelRatio, 0.25);
  assert.equal(init[2].wakeConfirmationFrames, 3);
});

it("module forwards user overrides of the wake confirmation options", () => {
  const { module } = loadModule({ cameraBackend: "v4l2", wakeConfirmationPixelRatio: 0.4, wakeConfirmationFrames: 5 });
  module.start();
  const init = module.notifications.find(([bus, name]) => bus === "socket" && name === "INIT_V4L2");
  assert.equal(init[2].wakeConfirmationPixelRatio, 0.4);
  assert.equal(init[2].wakeConfirmationFrames, 5);
});
