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

    it("passes the script path as one argument instead of a shell string", async () => {
      const { helper, calls } = loadNodeHelper();

      helper.platform = "x11";
      await helper.activateMonitor();

      // no shell parses this, so a module directory containing spaces or shell
      // metacharacters cannot split the path or inject anything
      assert.strictEqual(calls[0].file, "bash");
      assert.strictEqual(calls[0].args.length, 2);
      assert.ok(calls[0].args[0].endsWith("monitor-commands-x11.sh"));
      assert.strictEqual(calls[0].args[1], "on");
    });

    it("applies a slow off before a later on instead of racing it", async () => {
      const applied = [];
      const { helper } = loadNodeHelper({
        run: (command) => {
          const action = command.endsWith("off") ? "off" : "on";
          // the off script is the slow one, cec-client can take seconds
          const delay = action === "off" ? 30 : 0;
          return new Promise((resolve) => {
            setTimeout(() => {
              applied.push(action);
              resolve({ stdout: "" });
            }, delay);
          });
        },
      });

      helper.platform = "cec";
      const off = helper.deactivateMonitor();
      const on = helper.activateMonitor();
      await Promise.all([off, on]);

      // without queueing the fast on lands first and the slow off wins,
      // leaving the screen dark with someone standing in front of it
      assert.deepStrictEqual(applied, ["off", "on"]);
    });

    it("keeps queueing after a command fails", async () => {
      let first = true;
      const { helper, commands } = loadNodeHelper({
        run: () => {
          if (first) {
            first = false;
            throw new Error("boom");
          }
          return { stdout: "" };
        },
      });

      helper.platform = "x11";
      await assert.rejects(() => helper.activateMonitor());
      await helper.deactivateMonitor();

      assert.strictEqual(commands.length, 2);
      assert.match(commands[1], /sh off$/);
    });

    it("propagates a failing script", async () => {
      const { helper } = loadNodeHelper({
        run: () => {
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
        run: () => {
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
        run: () => {
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
        run: () => {
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
