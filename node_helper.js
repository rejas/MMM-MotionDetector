const NodeHelper = require("node_helper");
const exec = require("child_process").exec;
const Log = require("../../js/logger");
const path = require("path");

module.exports = NodeHelper.create({

  /**
   *
   */
  async start () {
    this.config = null;
    await this.isMonitorOn();
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
  async activateMonitor () {
    const scriptPath = this.getCommandScript();
    const isMonitorOn = await this.isMonitorOn();
    if (!isMonitorOn) {
      exec(`bash ${scriptPath} on`, function (err, out, code) {
        if (err) {
          Log.error(`error activating monitor: ${code}`);
        } else {
          Log.info("monitor has been activated.");
        }
      });
    }
  },

  /**
   *
   */
  async deactivateMonitor () {
    const scriptPath = this.getCommandScript();
    const isMonitorOn = await this.isMonitorOn();
    if (isMonitorOn) {
      exec(`bash ${scriptPath} off`, function (err, out, code) {
        if (err) {
          Log.error(`error deactivating monitor: ${code}`);
        } else {
          Log.info("monitor has been deactivated.");
        }
      });
    }
  },

  /**
   * @returns {Promise<boolean>}
   */
  async isMonitorOn () {
    const scriptPath = this.getCommandScript();
    return new Promise((resolve) => {
      exec(`bash ${scriptPath} status`, function (err, out, code) {
        if (err) {
          Log.error(`error calling monitor status: ${code}`);
          resolve(false);
          return;
        }
        const result = out.includes("=1") || out.trim() === "on";
        Log.info(`monitor is ${result ? "ON" : "OFF"}.`);
        resolve(result);
      });
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
