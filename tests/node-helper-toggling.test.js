const assert = require("node:assert");
const { describe, it } = require("node:test");
const { loadNodeHelper, flush } = require("./node-helper-mock");

describe("node_helper", () => {
  describe("monitor toggling", () => {
    it("turns the monitor on with a single command", async () => {
      const { helper, commands } = loadNodeHelper();

      helper.platform = "x11";
      await helper.activateMonitor();

      assert.deepStrictEqual(commands.length, 1);
      assert.match(commands[0], /monitor-commands-x11\.sh on$/);
    });

    it("turns the monitor off with a single command", async () => {
      const { helper, commands } = loadNodeHelper();

      helper.platform = "x11";
      await helper.deactivateMonitor();

      assert.deepStrictEqual(commands.length, 1);
      assert.match(commands[0], /monitor-commands-x11\.sh off$/);
    });

    it("never queries the status, the scripts are idempotent", async () => {
      const { helper, commands } = loadNodeHelper();

      helper.platform = "x11";
      await helper.activateMonitor();
      await helper.deactivateMonitor();

      assert.ok(!commands.some((command) => command.endsWith("status")));
    });

    it("turns the monitor on even when it is already on", async () => {
      // the old status check skipped the call in this case, which left the
      // monitor asleep whenever the status script misreported
      const { helper, commands } = loadNodeHelper({ exec: () => ({ stdout: "ON" }) });

      helper.platform = "x11";
      await helper.activateMonitor();

      assert.match(commands[0], /sh on$/);
    });

    it("propagates a failing script", async () => {
      const { helper } = loadNodeHelper({
        exec: () => {
          throw new Error("vcgencmd not found");
        },
      });

      helper.platform = "x11";

      await assert.rejects(() => helper.activateMonitor(), /vcgencmd not found/);
    });
  });

  describe("socket notifications", () => {
    it("activates the monitor on ACTIVATE_MONITOR", async () => {
      const { helper, commands } = loadNodeHelper();

      helper.platform = "x11";
      helper.socketNotificationReceived("ACTIVATE_MONITOR");
      await flush();

      assert.deepStrictEqual(commands.length, 1);
      assert.match(commands[0], /sh on$/);
    });

    it("deactivates the monitor on DEACTIVATE_MONITOR", async () => {
      const { helper, commands } = loadNodeHelper();

      helper.platform = "x11";
      helper.socketNotificationReceived("DEACTIVATE_MONITOR");
      await flush();

      assert.deepStrictEqual(commands.length, 1);
      assert.match(commands[0], /sh off$/);
    });

    it("ignores INIT_MONITOR without a payload", async () => {
      const { helper, commands } = loadNodeHelper();

      helper.socketNotificationReceived("INIT_MONITOR", undefined);
      await flush();

      assert.deepStrictEqual(commands, []);
    });

    it("does not shell out for an unrelated notification", async () => {
      const { helper, commands } = loadNodeHelper();

      helper.platform = "x11";
      helper.socketNotificationReceived("SOMETHING_ELSE");
      await flush();

      assert.deepStrictEqual(commands, []);
    });

    it("logs an error when the script fails", async () => {
      const { helper, logs } = loadNodeHelper({
        exec: () => {
          throw new Error("boom");
        },
      });

      helper.platform = "x11";
      helper.socketNotificationReceived("ACTIVATE_MONITOR");
      await flush();

      assert.strictEqual(logs.error.length, 1);
    });

    it("logs what the script wrote to stderr", async () => {
      const { helper, logs } = loadNodeHelper({
        exec: () => {
          const error = new Error("Command failed");
          error.stderr = "vcgencmd: command not found\n";
          throw error;
        },
      });

      helper.platform = "x11";
      helper.socketNotificationReceived("ACTIVATE_MONITOR");
      await flush();

      assert.match(logs.error[0], /vcgencmd: command not found/);
    });

    it("logs the message when the script could not be spawned at all", async () => {
      const { helper, logs } = loadNodeHelper({
        exec: () => {
          // a spawn failure never reaches the script, so it carries no stderr
          throw new Error("spawn ENOENT");
        },
      });

      helper.platform = "x11";
      helper.socketNotificationReceived("DEACTIVATE_MONITOR");
      await flush();

      assert.match(logs.error[0], /spawn ENOENT/);
      assert.doesNotMatch(logs.error[0], /undefined/);
    });
  });
});
