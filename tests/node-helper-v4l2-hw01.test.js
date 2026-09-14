const assert = require("node:assert/strict");
const { it } = require("node:test");
const { loadNodeHelper, flush } = require("./node-helper-mock");

const SIZE = 160 * 120;
const FIRST_CHANGED = 8841;
const SECOND_CHANGED = 15160;
// These tests pin the original single-frame contract, now an explicit setting.
const ONE_FRAME = { wakeConfirmationFrames: 1 };

// Strong local motion is textured, some pixels brighter and some darker than the
// background. A uniform bright block is indistinguishable from a light change.
function texturedPerson(base, from, to) {
  const frame = Buffer.from(base);
  for (let i = from; i < to; i++) frame[i] = i % 2 ? 230 : 0;
  return frame;
}

// Reconstruct an exposure transition, rather than replaying unavailable camera images.
// A -> B: 8,841 significant pixels (46.05%), plus a small change elsewhere.
// B -> C: 15,160 significant pixels (78.96%), mean delta 56.3229, one direction.
function transition(direction) {
  const a = Buffer.alloc(SIZE, 20);
  const b = Buffer.from(a);
  const c = Buffer.from(a);
  for (let i = 0; i < SIZE; i++) {
    b[i] += i < FIRST_CHANGED ? 35 : 5;
    c[i] = b[i] + (i < SECOND_CHANGED ? 70 : 5);
  }
  const d = Buffer.from(c);
  for (let i = 0; i < SIZE; i++) d[i] += 3;
  const frames = [a, b, c, d];
  return direction === "on" ? frames : frames.map((frame) => Buffer.from(frame.map((value) => 255 - value)));
}

async function setup(t, baseline, { off = true, config = {} } = {}) {
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
  await state.send(baseline, 0);
  if (off) {
    await state.send(baseline, 2000);
    assert.equal(state.helper.v4l2MonitorOn, false, "fixture must really reach OFF through timeout");
  }
  state.notifications.length = 0;
  state.onCount = () => state.commands.filter((command) => command.endsWith(" on")).length;
  state.motion = () =>
    state.notifications.filter((item) => item.notification === "V4L2_MOTION_STATUS" && item.payload.hasMotion);
  return state;
}

for (const direction of ["on", "off"]) {
  it(`HW-01 gradual light ${direction} never wakes the sleeping monitor`, async (t) => {
    const [a, b, c, d] = transition(direction);
    const s = await setup(t, a);
    await s.send(b);
    const awakeAfterFirstStep = s.helper.v4l2MonitorOn;
    await s.send(c);
    await s.send(d);
    await s.send(d);
    assert.equal(awakeAfterFirstStep, false, "the partial light step must not wake before classification");
    assert.equal(s.onCount(), 0);
    assert.equal(s.helper.v4l2MonitorOn, false);
    assert.equal(s.motion().length, 0);
  });

  it(`HW-01 real motion after gradual light ${direction} still wakes immediately`, async (t) => {
    const [a, b, c, d] = transition(direction);
    const s = await setup(t, a);
    await s.send(b);
    await s.send(c);
    await s.send(d);
    assert.equal(s.onCount(), 0);
    const person = Buffer.from(d);
    for (let i = 0; i < 100; i++) person[i] += direction === "on" ? 60 : -60;
    await s.send(person);
    assert.equal(s.onCount(), 1);
    assert.equal(s.helper.v4l2MonitorOn, true);
    assert.equal(s.motion().length, 1);
    assert.equal(s.motion()[0].payload.score, 100);
  });

  it(`HW-01 confirmed light ${direction} while ON emits no motion`, async (t) => {
    const baseline = Buffer.alloc(SIZE, direction === "on" ? 20 : 220);
    const changed = Buffer.alloc(SIZE, direction === "on" ? 100 : 140);
    const s = await setup(t, baseline, { off: false, config: { timeout: -1 } });
    await s.send(changed);
    await s.send(changed);
    assert.equal(s.motion().length, 0);
    assert.equal(s.helper.v4l2MonitorOn, true);
    assert.equal(s.onCount(), 0);
  });

  it(`HW-01 timeout remains active during light ${direction} and stabilization`, async (t) => {
    const [, b, c, d] = transition(direction);
    const s = await setup(t, b, { off: false });
    await s.send(c, 2000);
    await s.send(d);
    await s.send(d);
    assert.equal(s.helper.v4l2MonitorOn, false);
    assert.equal(s.commands.filter((command) => command.endsWith(" off")).length, 1);
    assert.equal(s.onCount(), 0);
    assert.equal(s.motion().length, 0);
  });
}

it("HW-01 ordinary local motion wakes without a confirmation frame", async (t) => {
  const baseline = Buffer.alloc(SIZE, 20);
  const s = await setup(t, baseline);
  const person = Buffer.from(baseline);
  person.fill(220, 0, 500);
  await s.send(person);
  assert.equal(s.onCount(), 1);
  assert.equal(s.motion().length, 1);
});

for (const continues of [false, true]) {
  it(`HW-01 strong local motion wakes on the next frame, continuation ${continues}`, async (t) => {
    const baseline = Buffer.alloc(SIZE, 110);
    const person = texturedPerson(baseline, 0, 7000);
    const s = await setup(t, baseline, { config: ONE_FRAME });
    await s.send(person);
    assert.equal(s.onCount(), 0, "ambiguous large motion gets exactly one confirmation frame");
    assert.equal(s.motion().length, 0);
    const next = Buffer.from(person);
    if (continues) next.fill(150, 0, 100);
    await s.send(next);
    assert.equal(s.onCount(), 1, "a person who stops moving must also be confirmed");
    assert.equal(s.motion().length, 1);
    assert.equal(s.motion()[0].payload.score, 7000);
    await s.send(next);
    assert.equal(s.onCount(), 1);
  });
}

it("HW-01 repeated strong motion cannot postpone confirmation indefinitely", async (t) => {
  const baseline = Buffer.alloc(SIZE, 100);
  const first = texturedPerson(baseline, 0, 7000);
  const next = texturedPerson(baseline, 7000, 14000);
  const s = await setup(t, baseline, { config: ONE_FRAME });
  await s.send(first);
  assert.equal(s.onCount(), 0);
  await s.send(next);
  assert.equal(s.onCount(), 1);
});

it("HW-01 a large candidate does not require missing brightness or direction measurements", async (t) => {
  const a = Buffer.alloc(SIZE, 100);
  const b = Buffer.from(a);
  b.fill(140, 0, 4420);
  b.fill(60, 4420, FIRST_CHANGED);
  const c = Buffer.from(b);
  for (let i = 0; i < SIZE; i++) c[i] += 60;
  const s = await setup(t, a);
  await s.send(b);
  assert.equal(s.onCount(), 0);
  await s.send(c);
  await s.send(c);
  assert.equal(s.onCount(), 0);
  assert.equal(s.motion().length, 0);
});

for (const ending of ["restart", "failure", "shutdown"]) {
  it(`HW-01 a pending wake does not survive camera ${ending}`, async (t) => {
    const a = Buffer.alloc(SIZE, 110);
    const b = texturedPerson(a, 0, FIRST_CHANGED);
    // one confirmation frame, so a surviving candidate would wake on the second frame
    const s = await setup(t, a, { config: ONE_FRAME });
    await s.send(b);
    assert.equal(s.onCount(), 0);
    if (ending === "failure") s.helper.v4l2Process.emit("exit", 1, null);
    if (ending === "shutdown") s.helper.stop();
    s.helper.startV4L2(s.config);
    await s.send(a);
    await s.send(a);
    assert.equal(s.onCount(), 0);
    assert.equal(s.helper.v4l2MonitorOn, false);
  });
}
for (const pixels of [4799, 4800]) {
  it(`HW-01 confirmation boundary at ${pixels} changed pixels`, async (t) => {
    const baseline = Buffer.alloc(SIZE, 20);
    const person = Buffer.from(baseline);
    person.fill(200, 0, pixels);
    const s = await setup(t, baseline, { config: ONE_FRAME });
    await s.send(person);
    assert.equal(s.onCount(), pixels === 4799 ? 1 : 0);
    await s.send(person);
    assert.equal(s.onCount(), 1);
  });
}

it("HW-01 confirmation waits for a complete frame rather than a data chunk", async (t) => {
  const a = Buffer.alloc(SIZE, 110);
  const b = texturedPerson(a, 0, FIRST_CHANGED);
  const s = await setup(t, a, { config: ONE_FRAME });
  await s.send(b);
  const proc = s.helper.v4l2Process;
  proc.stdout.emit("data", b.subarray(0, SIZE - 1));
  await flush();
  assert.equal(s.onCount(), 0);
  proc.stdout.emit("data", b.subarray(SIZE - 1));
  await flush();
  assert.equal(s.onCount(), 1);
});

for (const interval of [200, 1000, 2000]) {
  it(`HW-01 strong motion adds exactly one ${interval} ms capture cycle`, async (t) => {
    const a = Buffer.alloc(SIZE, 110);
    const b = texturedPerson(a, 0, FIRST_CHANGED);
    const s = await setup(t, a, { config: { ...ONE_FRAME, captureIntervalTime: interval } });
    await s.send(b, interval);
    assert.equal(s.onCount(), 0);
    const candidateAt = Date.now();
    await s.send(b, interval);
    assert.equal(s.onCount(), 1);
    assert.equal(s.helper.v4l2LastMotionAt - candidateAt, interval);
  });
}
