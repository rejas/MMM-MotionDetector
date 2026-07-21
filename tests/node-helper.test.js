const assert = require("node:assert");
const { describe, it } = require("node:test");
const { loadNodeHelper, flush } = require("./node-helper-mock");

const PLATFORMS = ["x11", "cec", "labwc", "mac-arm", "mac-intel"];

describe("node_helper", () => {
  describe("platform validation", () => {
    for (const platform of PLATFORMS) {
      it(`accepts the ${platform} platform`, async () => {
        const { helper, commands, logs } = loadNodeHelper();

        helper.initMonitor(platform);
        await flush();

        assert.strictEqual(helper.platform, platform);
        assert.deepStrictEqual(logs.error, []);
        assert.ok(commands.some((command) => command.includes(`monitor-commands-${platform}.sh`)));
      });
    }

    it("rejects an unknown platform without shelling out", async () => {
      const { helper, commands, logs } = loadNodeHelper();

      helper.initMonitor("wayland");
      await flush();

      assert.deepStrictEqual(commands, []);
      assert.strictEqual(logs.error.length, 1);
      assert.match(logs.error[0], /unknown platform/);
    });

    it("rejects a platform that would traverse out of the module directory", async () => {
      const { helper, commands, logs } = loadNodeHelper();

      helper.initMonitor("../../../../etc/passwd");
      await flush();

      assert.deepStrictEqual(commands, []);
      assert.strictEqual(logs.error.length, 1);
      assert.strictEqual(helper.platform, undefined);
    });
  });

  describe("script paths", () => {
    it("reports no valid platform before initMonitor ran", () => {
      const { helper } = loadNodeHelper();

      assert.strictEqual(helper.hasValidPlatform(), false);
    });

    it("builds the script path from the configured platform", () => {
      const { helper } = loadNodeHelper();

      helper.platform = "cec";

      assert.strictEqual(helper.hasValidPlatform(), true);
      assert.ok(helper.getCommandScript().endsWith("monitor-commands-cec.sh"));
    });
  });

  describe("toggling without a valid platform", () => {
    it("does not activate the monitor when no platform was set", async () => {
      const { helper, commands, logs } = loadNodeHelper();

      await helper.activateMonitor();

      assert.deepStrictEqual(commands, []);
      assert.strictEqual(logs.error.length, 1);
    });

    it("does not deactivate the monitor when no platform was set", async () => {
      const { helper, commands, logs } = loadNodeHelper();

      await helper.deactivateMonitor();

      assert.deepStrictEqual(commands, []);
      assert.strictEqual(logs.error.length, 1);
    });

    it("does not fall back to x11 after a platform was rejected", async () => {
      const { helper, commands } = loadNodeHelper();

      helper.initMonitor("wayland");
      await flush();
      helper.socketNotificationReceived("ACTIVATE_MONITOR");
      helper.socketNotificationReceived("DEACTIVATE_MONITOR");
      await flush();

      assert.deepStrictEqual(commands, []);
    });

    it("keeps a working platform when a later init is rejected", async () => {
      const { helper, commands } = loadNodeHelper();

      helper.initMonitor("cec");
      await flush();
      helper.initMonitor("wayland");
      await flush();
      commands.length = 0;
      helper.socketNotificationReceived("DEACTIVATE_MONITOR");
      await flush();

      // a second module instance sharing this helper must not be able to break
      // an already working one by passing a bad platform
      assert.strictEqual(helper.platform, "cec");
      assert.ok(commands.some((command) => command.includes("monitor-commands-cec.sh")));
    });
  });
});
