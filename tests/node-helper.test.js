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
    it("falls back to x11 when no platform was set", () => {
      const { helper } = loadNodeHelper();

      assert.ok(helper.getCommandScript().endsWith("monitor-commands-x11.sh"));
    });

    it("builds the script path from the configured platform", () => {
      const { helper } = loadNodeHelper();

      helper.platform = "cec";

      assert.ok(helper.getCommandScript().endsWith("monitor-commands-cec.sh"));
    });
  });
});
