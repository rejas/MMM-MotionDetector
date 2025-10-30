const NodeHelper = require("node_helper");
const exec = require("child_process").exec;
const Log = require("../../js/logger");
const path = require("path");

module.exports = NodeHelper.create({

  /**
   *
   */
  start () {
    this.config = null;
    this.isMonitorOn((result) => {
      Log.info(`monitor is ${result ? "ON" : "OFF"}.`);
    });
  },

  /**
   * Get the command script path based on platform option
   */
  getCommandScript: function () {
    const platform = this.config?.platform || "x11";
    const scriptPath = path.join(__dirname, `monitor-commands-${platform}.sh`);
    return scriptPath;
  },

  /**
   *
   */
  activateMonitor () {
    const scriptPath = this.getCommandScript();
    this.isMonitorOn((result) => {
      if (!result) {
        exec(`bash ${scriptPath} on`, function (err, out, code) {
          if (err) {
            Log.error(`error activating monitor: ${code}`);
          } else {
            Log.info("monitor has been activated.");
          }
        });
      }
    });
  },

  /**
   *
   */
  deactivateMonitor () {
    const scriptPath = this.getCommandScript();
    this.isMonitorOn((result) => {
      if (result) {
        exec(`bash ${scriptPath} off`, function (err, out, code) {
          if (err) {
            Log.error(`error deactivating monitor: ${code}`);
          } else {
            Log.info("monitor has been deactivated.");
          }
        });
      }
    });
  },

  /**
   *
   * @param resultCallback
   */
  isMonitorOn (resultCallback) {
    const scriptPath = this.getCommandScript();
    exec(`bash ${scriptPath} status`, function (err, out, code) {
      if (err) {
        Log.error(`error calling monitor status: ${code}`);
        return;
      }

      Log.info(`monitor status is ${out}`);
      resultCallback(out.includes("=1") || out.trim() === "on");
    });
  },

  /**
   *
   * @param notification
   * @param payload
   */
  socketNotificationReceived (notification, payload) {
    if (notification === "CONFIG" && payload) {
      this.config = payload;
    }
    if (notification === "ACTIVATE_MONITOR") {
      Log.info("activating monitor.");
      this.activateMonitor();
    }
    if (notification === "DEACTIVATE_MONITOR") {
      Log.info("deactivating monitor, percentage off: " + payload.percentageOff);
      this.deactivateMonitor();
    }
  }
});
