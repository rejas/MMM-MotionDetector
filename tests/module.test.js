const assert = require("node:assert");
const { describe, it } = require("node:test");
const { loadModule, setLastMotionAge } = require("./module-mock");

describe("MMM-MotionDetector", () => {
  describe("motion detected", () => {
    it("announces motion on both the socket and the module bus", () => {
      const { module, capture } = loadModule();

      capture({ score: 42, hasMotion: true });

      assert.deepStrictEqual(module.notifications, [
        ["socket", "MOTION_DETECTED", { score: 42 }],
        ["notification", "MOTION_DETECTED", { score: 42 }],
      ]);
      assert.strictEqual(module.lastScoreDetected, 42);
    });

    it("does not activate the monitor when it is already on", () => {
      const { module, capture } = loadModule();

      capture({ score: 42, hasMotion: true });

      assert.ok(!module.notifications.some(([, notification]) => notification === "ACTIVATE_MONITOR"));
    });

    it("reactivates the monitor and books the powered off time", () => {
      const { module, capture } = loadModule({ timeout: 1000 });

      setLastMotionAge(module, 5000);
      capture({ score: 1, hasMotion: false });
      assert.strictEqual(module.poweredOff, true);

      module.notifications.length = 0;
      module.lastTimePoweredOff = new Date(Date.now() - 3000);
      capture({ score: 50, hasMotion: true });

      assert.ok(module.notifications.some(([, notification]) => notification === "ACTIVATE_MONITOR"));
      assert.strictEqual(module.poweredOff, false);
      assert.ok(module.poweredOffTime >= 3000, `expected at least 3000ms, got ${module.poweredOffTime}`);
    });
  });

  describe("no motion", () => {
    it("keeps the monitor on before the timeout elapsed", () => {
      const { module, capture } = loadModule({ timeout: 120000 });

      setLastMotionAge(module, 1000);
      capture({ score: 1, hasMotion: false });

      assert.deepStrictEqual(module.notifications, []);
      assert.strictEqual(module.poweredOff, false);
    });

    it("powers the monitor off once the timeout elapsed", () => {
      const { module, capture } = loadModule({ timeout: 1000 });

      setLastMotionAge(module, 5000);
      capture({ score: 1, hasMotion: false });

      assert.deepStrictEqual(module.notifications, [["socket", "DEACTIVATE_MONITOR", undefined]]);
      assert.strictEqual(module.poweredOff, true);
    });

    it("does not repeat DEACTIVATE_MONITOR on every following frame", () => {
      const { module, capture } = loadModule({ timeout: 1000 });

      setLastMotionAge(module, 5000);
      capture({ score: 1, hasMotion: false });
      module.notifications.length = 0;
      capture({ score: 1, hasMotion: false });
      capture({ score: 1, hasMotion: false });

      assert.deepStrictEqual(module.notifications, []);
    });

    it("never powers the monitor off for a negative timeout", () => {
      const { module, capture } = loadModule({ timeout: -1 });

      setLastMotionAge(module, 24 * 60 * 60 * 1000);
      capture({ score: 1, hasMotion: false });

      assert.deepStrictEqual(module.notifications, []);
      assert.strictEqual(module.poweredOff, false);
    });
  });

  describe("template data", () => {
    it("surfaces an init error", () => {
      const { module, initError } = loadModule();

      initError("NotAllowedError");

      assert.strictEqual(module.error, "NotAllowedError");
      assert.strictEqual(module.getTemplateData().error, "NotAllowedError");
    });

    it("renders without an error once a frame was captured", () => {
      const { module, capture } = loadModule();

      capture({ score: 42, hasMotion: true });
      const data = module.getTemplateData();

      assert.strictEqual(data.lastScoreDetected, 42);
      assert.strictEqual(data.error, null);
      assert.strictEqual(typeof data.lastTimeMotionDetected, "string");
    });
  });

  describe("socket notifications", () => {
    it("forwards USER_PRESENCE to the module bus", () => {
      const { module } = loadModule();

      module.socketNotificationReceived("USER_PRESENCE", true);

      assert.deepStrictEqual(module.notifications, [["notification", "USER_PRESENCE", true]]);
    });

    it("ignores unknown notifications", () => {
      const { module } = loadModule();

      module.socketNotificationReceived("SOMETHING_ELSE", true);

      assert.deepStrictEqual(module.notifications, []);
    });
  });
});
