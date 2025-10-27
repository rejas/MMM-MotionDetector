const NodeHelper = require("node_helper");
const exec = require("child_process").exec;
const Log = require("../../js/logger");
const path = require("path");

module.exports = NodeHelper.create({
  /**
   *
   */
  start: function () {
    this.config = null;
    this.isMonitorOn(function (result) {
      Log.info("MMM-MotionDetector: monitor is " + (result ? "ON" : "OFF") + ".");
    });
  },

  /**
   * Get the command script path based on platform option
   */
  getCommandScript: function () {
    const platform = this.config?.platform || "default";
    const scriptPath = path.join(__dirname, `monitor-commands-${platform}.sh`);
    return scriptPath;
  },

  /**
   *
   */
  activateMonitor: function () {
    const scriptPath = this.getCommandScript();
    this.isMonitorOn(function (result) {
      if (!result) {
        exec(`bash ${scriptPath} on`, function (err, out, code) {
          if (err) {
            Log.error("MMM-MotionDetector: error activating monitor: " + code);
          } else {
            Log.info("MMM-MotionDetector: monitor has been activated.");
          }
        });
      }
    });
  },

  /**
   *
   */
  deactivateMonitor: function () {
    const scriptPath = this.getCommandScript();
    this.isMonitorOn(function (result) {
      if (result) {
        exec(`bash ${scriptPath} off`, function (err, out, code) {
          if (err) {
            Log.error("MMM-MotionDetector: error deactivating monitor: " + code);
          } else {
            Log.info("MMM-MotionDetector: monitor has been deactivated.");
          }
        });
      }
    });
  },

  /**
   *
   * @param resultCallback
   */
  isMonitorOn: function (resultCallback) {
    const scriptPath = this.getCommandScript();
    exec(`bash ${scriptPath} status`, function (err, out, code) {
      if (err) {
        Log.error("MMM-MotionDetector: error calling monitor status: " + code);
        return;
      }

      Log.info("MMM-MotionDetector: monitor status is " + out);
      resultCallback(out.includes("=1") || out.trim() === "on");
    });
  },

  /**
   *
   * @param notification
   * @param payload
   */
  socketNotificationReceived: function (notification, payload) {
    if (notification === "CONFIG" && payload) {
      this.config = payload;
    }
    if (notification === "ACTIVATE_MONITOR") {
      Log.info("MMM-MotionDetector: activating monitor.");
      this.activateMonitor();
    }
    if (notification === "DEACTIVATE_MONITOR") {
      Log.info("MMM-MotionDetector: deactivating monitor.");
      this.deactivateMonitor();
    }
  },
});
