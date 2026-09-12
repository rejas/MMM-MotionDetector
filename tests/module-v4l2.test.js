const assert = require("node:assert");
const { describe, it } = require("node:test");
const { loadModule } = require("./module-mock");

/**
 * Drive one V4L2_MOTION_STATUS notification through the module.
 * @param module module instance returned by loadModule
 * @param payload {score, hasMotion, monitorOn}
 */
function receiveMotionStatus(module, payload) {
  module.socketNotificationReceived("V4L2_MOTION_STATUS", payload);
}

describe("MMM-MotionDetector V4L2 backend", () => {
  describe("camera lifecycle notifications", () => {
    it("ignores V4L2 notifications when the browser backend is active", () => {
      const { module } = loadModule({ cameraBackend: "browser" });

      module.socketNotificationReceived("V4L2_CAMERA_ERROR", { error: "boom" });

      assert.strictEqual(module.error, null);
    });

    it("surfaces a camera error", () => {
      const { module } = loadModule({ cameraBackend: "v4l2" });

      module.socketNotificationReceived("V4L2_CAMERA_ERROR", { error: "Device or resource busy" });

      assert.strictEqual(module.error, "Device or resource busy");
      assert.strictEqual(module.getTemplateData().error, "Device or resource busy");
    });

    it("clears a previous error once the camera reports started", () => {
      const { module } = loadModule({ cameraBackend: "v4l2" });

      module.socketNotificationReceived("V4L2_CAMERA_ERROR", { error: "boom" });
      assert.strictEqual(module.error, "boom");

      module.socketNotificationReceived("V4L2_CAMERA_STARTED", { device: "/dev/video0" });

      assert.strictEqual(module.error, null);
    });
  });

  describe("percentagePoweredOff", () => {
    it("stays at zero while the monitor has never been off", () => {
      const { module } = loadModule({ cameraBackend: "v4l2" });

      receiveMotionStatus(module, { score: 1, hasMotion: false, monitorOn: true });

      assert.strictEqual(Number(module.percentagePoweredOff), 0);
    });

    it("counts the ongoing off stretch before the monitor wakes", () => {
      const { module } = loadModule({ cameraBackend: "v4l2" });
      module.timeStarted = Date.now() - 10000;
      module.lastTimePoweredOff = new Date(Date.now() - 4000);
      module.poweredOff = true;

      receiveMotionStatus(module, { score: 1, hasMotion: false, monitorOn: false });

      // the ongoing off stretch (~4s out of ~10s) must already show up, not
      // just the (still zero) previously accumulated poweredOffTime
      assert.ok(
        Number(module.percentagePoweredOff) > 0,
        `expected a nonzero percentage while off, got ${module.percentagePoweredOff}`
      );
    });

    it("books the accumulated off time on wake and does not double count", () => {
      const { module } = loadModule({ cameraBackend: "v4l2" });
      module.timeStarted = Date.now() - 10000;
      module.lastTimePoweredOff = new Date(Date.now() - 4000);
      module.poweredOff = true;

      receiveMotionStatus(module, { score: 50, hasMotion: true, monitorOn: true });

      assert.strictEqual(module.poweredOff, false);
      assert.ok(
        module.poweredOffTime >= 4000,
        `expected at least 4000ms booked, got ${module.poweredOffTime}`
      );

      const bookedTime = module.poweredOffTime;

      // a second ON frame must not add the same stretch again
      receiveMotionStatus(module, { score: 50, hasMotion: true, monitorOn: true });

      assert.strictEqual(module.poweredOffTime, bookedTime);
    });

    it("tracks a full OFF -> ON transition end to end", () => {
      const { module } = loadModule({ cameraBackend: "v4l2" });
      module.timeStarted = Date.now() - 20000;

      receiveMotionStatus(module, { score: 1, hasMotion: false, monitorOn: false });
      assert.strictEqual(module.poweredOff, true);

      module.lastTimePoweredOff = new Date(Date.now() - 5000);
      receiveMotionStatus(module, { score: 50, hasMotion: true, monitorOn: true });

      assert.strictEqual(module.poweredOff, false);
      assert.ok(module.poweredOffTime >= 5000, `expected at least 5000ms, got ${module.poweredOffTime}`);
    });

    it("never produces NaN or negative values", () => {
      const { module } = loadModule({ cameraBackend: "v4l2" });

      receiveMotionStatus(module, { score: 1, hasMotion: false, monitorOn: true });

      assert.ok(!Number.isNaN(Number(module.percentagePoweredOff)));
      assert.ok(Number(module.percentagePoweredOff) >= 0);
    });
  });
});
