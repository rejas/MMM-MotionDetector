const assert = require("node:assert/strict");
const { it } = require("node:test");
const { loadNodeHelper, flush } = require("./node-helper-mock");
const { loadModule } = require("./module-mock");

const SIZE = 160 * 120;
const BASE = Buffer.alloc(SIZE, 110);

async function setup(t, { off = true, config = {} } = {}) {
  let now = 1000;
  t.mock.method(Date, "now", () => now);
  const state = loadNodeHelper();
  state.config = { timeout: 1000, scoreThreshold: 20, captureIntervalTime: 1000, ...config };
  // route helper statuses through the real module to observe MOTION_DETECTED
  state.module = loadModule({ ...state.config, cameraBackend: "v4l2" }).module;
  state.helper.sendSocketNotification = (notification, payload) => {
    state.notifications.push({ notification, payload });
    state.module.socketNotificationReceived(notification, payload);
  };
  state.helper.platform = "x11";
  state.helper.startV4L2(state.config);
  t.after(() => state.helper.stop());
  state.send = async (frame, elapsed = 1000) => {
    now += elapsed;
    state.helper.v4l2Process.stdout.emit("data", frame);
    await flush();
  };
  await state.send(BASE, 0);
  if (off) {
    await state.send(BASE, 2000);
    assert.equal(state.helper.v4l2MonitorOn, false, "fixture must reach OFF through the regular timeout");
  }
  state.notifications.length = 0;
  state.module.notifications.length = 0;
  state.logs.info.length = 0;
  state.onCount = () => state.commands.filter((command) => command.endsWith(" on")).length;
  state.motionStatuses = () =>
    state.notifications.filter((item) => item.notification === "V4L2_MOTION_STATUS" && item.payload.hasMotion);
  state.motionDetected = () => state.module.notifications.filter(([, name]) => name === "MOTION_DETECTED");
  state.ignored = () => state.logs.info.filter((line) => line.startsWith("wake candidate ignored as global light change"));
  // cumulative ON commands after each delivered frame
  state.run = async (frames) => {
    const trace = [];
    for (const frame of frames) {
      await state.send(frame);
      trace.push(state.onCount());
    }
    return trace;
  };
  return state;
}

// The frame following `base`: `changed` pixels move by `delta` (`against` of them the
// opposite way), further pixels move by less than pixelDiffThreshold until the summed
// delta equals `sum`. Changed pixels set pixels and direction; the small moves only
// adjust brightness without counting as changed.
function step(base, { changed, delta, against = 0, sum }) {
  const frame = Buffer.from(base);
  let total = 0;
  for (let i = 0; i < changed; i++) {
    const d = i < changed - against ? delta : -delta;
    frame[i] = base[i] + d;
    total += d;
  }
  let rest = sum === undefined ? 0 : sum - total;
  for (let i = changed; i < SIZE && rest !== 0; i++) {
    const d = Math.sign(rest) * Math.min(29, Math.abs(rest));
    frame[i] = base[i] + d;
    rest -= d;
  }
  assert.equal(rest, 0, "fixture cannot reach the requested brightness");
  return frame;
}

// A person is textured: some pixels get brighter, some darker, like clothing against a wall.
function person(base, from, to) {
  const frame = Buffer.from(base);
  for (let i = from; i < to; i++) frame[i] = i % 2 ? 230 : 0;
  return frame;
}

// Instrumented Pi log: score=8193, pixels=42.7%, brightness=42.5, direction=100.0%
const piLight = (sign) => step(BASE, { changed: 8193, delta: 99 * sign, sum: 816000 * sign });

for (const sign of [1, -1]) {
  const light = sign > 0 ? "on" : "off";
  const brightness = (42.5 * sign).toFixed(1);

  it(`Pi night light ${light}: 42.7 % pixels, brightness ${brightness}, 100 % direction never wakes`, async (t) => {
    const s = await setup(t);
    const lit = piLight(sign);
    assert.deepEqual(await s.run([lit, lit, lit, lit, lit]), [0, 0, 0, 0, 0]);
    assert.equal(s.helper.v4l2MonitorOn, false);
    assert.equal(s.motionStatuses().length, 0);
    assert.equal(s.motionDetected().length, 0);
    assert.deepEqual(s.ignored(), [
      `wake candidate ignored as global light change (score=8193, pixels=42.7%, brightness=${brightness}, direction=100.0%).`
    ]);
  });

  // [label, frame parameters, classified as wake light change]
  for (const [label, params, classified] of [
    ["pixels exactly 0.30", { changed: 5760, delta: 60 }, true],
    ["pixels just below 0.30", { changed: 5759, delta: 60 }, false],
    ["brightness exactly 12", { changed: 6000, delta: 30, sum: 230400 }, true],
    ["brightness just below 12", { changed: 6000, delta: 30, sum: 230399 }, false],
    ["direction exactly 0.80", { changed: 10000, delta: 100, against: 2000 }, true],
    ["direction just below 0.80", { changed: 10000, delta: 100, against: 2001 }, false]
  ]) {
    it(`light ${light} boundary: ${label}`, async (t) => {
      const s = await setup(t);
      const frame = step(BASE, {
        ...params,
        delta: params.delta * sign,
        sum: params.sum === undefined ? undefined : params.sum * sign
      });
      const trace = await s.run([frame, frame, frame, frame, frame]);
      if (classified) {
        assert.deepEqual(trace, [0, 0, 0, 0, 0]);
        assert.equal(s.ignored().length, 1);
      } else {
        // not a light change on its own: the regular confirmation window decides
        assert.deepEqual(trace, [0, 0, 0, 1, 1]);
        assert.equal(s.ignored().length, 0);
        assert.equal(s.motionDetected().length, 1);
      }
    });
  }

  it(`light ${light}: small motion right after the ignored light change wakes again`, async (t) => {
    const s = await setup(t);
    const lit = piLight(sign);
    const small = person(lit, 12000, 12500);
    // light change, stabilization frame, then real local motion
    assert.deepEqual(await s.run([lit, lit, small]), [0, 0, 1]);
    assert.equal(s.motionDetected().length, 1);
  });

  it(`light ${light}: large real motion after the ignored light change pends and wakes`, async (t) => {
    const s = await setup(t);
    const lit = piLight(sign);
    const walker = person(lit, 9000, 16000);
    assert.deepEqual(await s.run([lit, lit, walker, walker, walker, walker]), [0, 0, 0, 0, 0, 1]);
    assert.equal(s.motionDetected().length, 1);
  });
}

it("small local motion wakes immediately", async (t) => {
  const s = await setup(t);
  assert.deepEqual(await s.run([step(BASE, { changed: 500, delta: 100 })]), [1]);
  assert.equal(s.motionDetected().length, 1);
  assert.equal(s.ignored().length, 0);
});

for (const [label, params] of [
  ["31 % one direction but low brightness", { changed: 6000, delta: 35 }],
  ["50 % with low brightness", { changed: 9600, delta: 60, against: 4000 }],
  ["47 % bright but mixed direction", { changed: 9000, delta: 100, against: 2250 }]
]) {
  it(`large real motion is not ignored as light: ${label}`, async (t) => {
    const s = await setup(t);
    const frame = step(BASE, params);
    assert.deepEqual(await s.run([frame, frame, frame, frame]), [0, 0, 0, 1]);
    assert.equal(s.ignored().length, 0);
    assert.equal(s.motionDetected().length, 1);
    assert.match(
      s.logs.info.find((line) => line.startsWith("large wake candidate held back")),
      /\(score=\d+, pixels=\d+\.\d%, brightness=-?\d+\.\d, direction=\d+\.\d%\)/
    );
  });
}

it("a person moving through most of the image wakes exactly once", async (t) => {
  const s = await setup(t);
  const m0 = person(BASE, 0, 7000);
  const m1 = person(BASE, 7000, 14000);
  const m2 = person(BASE, 14000, SIZE);
  // 73 % changed pixels between m0 and m1, but no single dominant direction
  assert.deepEqual(await s.run([m0, m1, m2, m0, m1, m2]), [0, 0, 0, 1, 1, 1]);
  assert.equal(s.ignored().length, 0);
  // the wake frame plus the two following motion frames while the monitor is on
  assert.equal(s.motionDetected().length, 3);
});

it("a light change inside the confirmation window discards the held-back wake", async (t) => {
  const s = await setup(t);
  const candidate = step(BASE, { changed: 6000, delta: 35 });
  const light = step(candidate, { changed: 8000, delta: 40 });
  assert.deepEqual(await s.run([candidate, light, light, light, light]), [0, 0, 0, 0, 0]);
  assert.equal(s.ignored().length, 1);
  assert.equal(s.motionDetected().length, 0);
});

it("the wake light classification never applies while the monitor is on", async (t) => {
  const s = await setup(t, { off: false, config: { timeout: -1 } });
  await s.send(piLight(1));
  assert.equal(s.motionStatuses().length, 1, "the regular light filter must stay unchanged");
  assert.equal(s.ignored().length, 0);
});

for (const value of [0.5, "0.5"]) {
  it(`wakeLightChangePixelRatio ${JSON.stringify(value)} leaves the 42.7 % candidate to the window`, async (t) => {
    const s = await setup(t, { config: { wakeLightChangePixelRatio: value } });
    const lit = piLight(1);
    assert.deepEqual(await s.run([lit, lit, lit, lit, lit]), [0, 0, 0, 1, 1]);
    assert.equal(s.ignored().length, 0);
  });
}

// 10.4 % changed pixels, brightness exactly 12, one direction
const faintLight = step(BASE, { changed: 2000, delta: 100, sum: 230400 });

it("wakeLightChangePixelRatio 0 keeps brightness and direction as the only criteria", async (t) => {
  const s = await setup(t, { config: { wakeLightChangePixelRatio: 0 } });
  assert.deepEqual(await s.run([faintLight, faintLight, faintLight]), [0, 0, 0]);
  assert.equal(s.ignored().length, 1);
});

it("the default ratio does not classify the same 10.4 % change as light", async (t) => {
  const s = await setup(t);
  assert.deepEqual(await s.run([faintLight]), [1]);
});

for (const value of [-0.1, 1.5, NaN, Infinity, "abc", null, undefined]) {
  it(`invalid wakeLightChangePixelRatio ${String(value)} falls back to 0.30`, async (t) => {
    const s = await setup(t, { config: { wakeLightChangePixelRatio: value } });
    const lit = piLight(1);
    assert.deepEqual(await s.run([lit, lit, lit, lit, lit]), [0, 0, 0, 0, 0]);
    assert.equal(s.ignored().length, 1);
  });
}

it("module defaults wakeLightChangePixelRatio to 0.30 and forwards it", () => {
  const { module } = loadModule({ cameraBackend: "v4l2" });
  assert.equal(module.config.wakeLightChangePixelRatio, 0.3);
  assert.equal(module.config.lightChangePixelRatio, 0.55, "the regular light filter default must not change");
  module.start();
  const init = module.notifications.find(([bus, name]) => bus === "socket" && name === "INIT_V4L2");
  assert.equal(init[2].wakeLightChangePixelRatio, 0.3);
});

it("module forwards a user override of wakeLightChangePixelRatio", () => {
  const { module } = loadModule({ cameraBackend: "v4l2", wakeLightChangePixelRatio: 0.45 });
  module.start();
  const init = module.notifications.find(([bus, name]) => bus === "socket" && name === "INIT_V4L2");
  assert.equal(init[2].wakeLightChangePixelRatio, 0.45);
});
