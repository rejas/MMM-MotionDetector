const assert = require("node:assert");
const { describe, it } = require("node:test");
const { loadModule, setLastMotionAge } = require("./module-mock");

describe("MMM-MotionDetector", () => {
  describe("motion detected", () => {
    it("announces motion on the module bus", () => {
      const { module, capture } = loadModule();

      capture({ score: 42, hasMotion: true });

      assert.deepStrictEqual(module.notifications, [["notification", "MOTION_DETECTED", { score: 42 }]]);
      assert.strictEqual(module.lastScoreDetected, 42);
    });

    it("does not send MOTION_DETECTED over the socket, the node helper has no handler for it", () => {
      const { module, capture } = loadModule();

      capture({ score: 42, hasMotion: true });

      assert.ok(
        !module.notifications.some(([bus, notification]) => bus === "socket" && notification === "MOTION_DETECTED")
      );
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

  describe("additionalNotification", () => {
    const hasSelfie = (module) =>
      module.notifications.some(([bus, notification]) => bus === "notification" && notification === "TAKE_SELFIE");

    /** Drive the module into the idle state so the next motion is an arrival. */
    const goIdle = (module, capture) => {
      setLastMotionAge(module, 5000);
      capture({ score: 1, hasMotion: false });
      module.notifications.length = 0;
    };

    it("is not sent by default", () => {
      const { module, capture } = loadModule({ timeout: 1000 });

      goIdle(module, capture);
      capture({ score: 42, hasMotion: true });

      assert.ok(!hasSelfie(module));
    });

    it("fires on the arrival edge with the score payload", () => {
      const { module, capture } = loadModule({ additionalNotification: "TAKE_SELFIE", timeout: 1000 });

      goIdle(module, capture);
      capture({ score: 42, hasMotion: true });

      assert.ok(
        module.notifications.some(
          ([bus, notification, payload]) =>
            bus === "notification" && notification === "TAKE_SELFIE" && payload.score === 42
        )
      );
    });

    it("does not fire on the first motion, since there was no quiet period", () => {
      const { module, capture } = loadModule({ additionalNotification: "TAKE_SELFIE" });

      capture({ score: 42, hasMotion: true });

      assert.ok(!hasSelfie(module));
    });

    it("does not repeat while motion continues", () => {
      const { module, capture } = loadModule({ additionalNotification: "TAKE_SELFIE", timeout: 1000 });

      goIdle(module, capture);
      capture({ score: 42, hasMotion: true }); // arrival, fires
      module.notifications.length = 0;
      capture({ score: 50, hasMotion: true }); // still present, must not fire again

      assert.ok(!hasSelfie(module));
    });

    it("fires again on a second arrival after going quiet once more", () => {
      const { module, capture } = loadModule({ additionalNotification: "TAKE_SELFIE", timeout: 1000 });

      goIdle(module, capture);
      capture({ score: 42, hasMotion: true });
      goIdle(module, capture);
      capture({ score: 42, hasMotion: true });

      assert.ok(hasSelfie(module));
    });

    it("is not sent when there is no motion", () => {
      const { module, capture } = loadModule({ additionalNotification: "TAKE_SELFIE", timeout: 1000 });

      setLastMotionAge(module, 5000);
      capture({ score: 1, hasMotion: false });

      assert.ok(!hasSelfie(module));
    });

    it("fires on arrival even when display control is off", () => {
      const { module, capture } = loadModule({
        additionalNotification: "TAKE_SELFIE",
        controlDisplay: false,
        timeout: 1000,
      });

      goIdle(module, capture);
      capture({ score: 42, hasMotion: true });

      assert.ok(hasSelfie(module));
      assert.ok(!module.notifications.some(([, notification]) => notification === "ACTIVATE_MONITOR"));
    });

    it("never fires when the timeout is negative, there is no quiet threshold", () => {
      const { module, capture } = loadModule({ additionalNotification: "TAKE_SELFIE", timeout: -1 });

      setLastMotionAge(module, 24 * 60 * 60 * 1000);
      capture({ score: 1, hasMotion: false });
      capture({ score: 42, hasMotion: true });

      assert.ok(!hasSelfie(module));
    });
  });

  describe("controlDisplay", () => {
    it("initialises the monitor by default", () => {
      const { startNotifications } = loadModule();

      assert.ok(startNotifications.some(([, notification]) => notification === "INIT_MONITOR"));
    });

    it("does not initialise the monitor when disabled", () => {
      const { startNotifications } = loadModule({ controlDisplay: false });

      assert.ok(!startNotifications.some(([, notification]) => notification === "INIT_MONITOR"));
    });

    it("does not power the monitor off when disabled", () => {
      const { module, capture } = loadModule({ controlDisplay: false, timeout: 1000 });

      setLastMotionAge(module, 5000);
      capture({ score: 1, hasMotion: false });

      assert.ok(!module.notifications.some(([, notification]) => notification === "DEACTIVATE_MONITOR"));
      assert.strictEqual(module.poweredOff, false);
    });

    it("does not activate the monitor on motion when disabled", () => {
      const { module, capture } = loadModule({ controlDisplay: false, timeout: 1000 });

      // even if some earlier state had marked it powered off, no ACTIVATE goes out
      module.poweredOff = true;
      capture({ score: 50, hasMotion: true });

      assert.ok(!module.notifications.some(([, notification]) => notification === "ACTIVATE_MONITOR"));
    });

    it("still reports motion when display control is disabled", () => {
      const { module, capture } = loadModule({ controlDisplay: false });

      capture({ score: 42, hasMotion: true });

      assert.ok(
        module.notifications.some(([bus, notification]) => bus === "notification" && notification === "MOTION_DETECTED")
      );
    });
  });

  describe("template data", () => {
    it("surfaces an init error", () => {
      const { module, initError } = loadModule();

      initError("NotAllowedError");

      assert.strictEqual(module.error, "NotAllowedError");
      assert.strictEqual(module.getTemplateData().error, "NotAllowedError");
    });

    it("renders when no motion was ever detected", () => {
      const { module } = loadModule();

      // the template is rendered on the init error path too, where a capture
      // may never have run and lastTimeMotionDetected can still be unset
      module.lastTimeMotionDetected = null;

      assert.doesNotThrow(() => module.getTemplateData());
      assert.strictEqual(module.getTemplateData().lastTimeMotionDetected, null);
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
});
