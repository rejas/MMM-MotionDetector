const NodeHelper = require("node_helper");
const exec = require("child_process").exec;
const Log = require("../../js/logger");
const path = require("path");

module.exports = NodeHelper.create({

  /**
   * @param platform
   */
  initMonitor (platform) {
    this.platform = platform;
    this.activateMonitor();
    },

  /**
   * Get the command script path based on platform option
   */
  getCommandScript () {
    const platform = this.platform || "x11";
    return path.join(__dirname, `monitor-commands-${platform}.sh`);
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
    if (notification === "INIT_MONITOR" && payload) {
      Log.info("initialising monitor.");
      this.initMonitor(payload);
    }
    if (notification === "ACTIVATE_MONITOR") {
      Log.info("activating monitor.");
      this.activateMonitor();
    }
    if (notification === "DEACTIVATE_MONITOR") {
      Log.info("deactivating monitor, percentage off: " + payload.percentageOff + ".");
      this.deactivateMonitor();
    }
  }
});
