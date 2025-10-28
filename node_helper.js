const NodeHelper = require("node_helper");
const exec = require("child_process").exec;
const Log = require("../../js/logger");

module.exports = NodeHelper.create({

  /**
   *
   */
  start () {
    this.isMonitorOn((result) => {
      Log.info(`MMM-MotionDetector: monitor is ${result ? "ON" : "OFF"}.`);
    });
  },

  /**
   *
   */
  activateMonitor () {
    this.isMonitorOn((result) => {
      if (!result) {
        exec("vcgencmd display_power 1", (err, out, code) => {
          if (err) {
            Log.error(`MMM-MotionDetector: error activating monitor: ${code}`);
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
  deactivateMonitor () {
    this.isMonitorOn((result) => {
      if (result) {
        exec("vcgencmd display_power 0", (err, out, code) => {
          if (err) {
            Log.error(`MMM-MotionDetector: error deactivating monitor: ${code}`);
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
  isMonitorOn (resultCallback) {
    exec("vcgencmd display_power", (err, out, code) => {
      if (err) {
        Log.error(`MMM-MotionDetector: error calling monitor status: ${code}`);
        return;
      }

      Log.info(`MMM-MotionDetector: monitor status is ${out}`);
      resultCallback(out.includes("=1"));
    });
  },

  /**
   *
   * @param notification
   * @param payload
   */
  socketNotificationReceived (notification, payload) {
    if (notification === "ACTIVATE_MONITOR") {
      Log.info("MMM-MotionDetector: activating monitor.");
      this.activateMonitor();
    }
    if (notification === "DEACTIVATE_MONITOR") {
      Log.info("MMM-MotionDetector: deactivating monitor.");
      this.deactivateMonitor();
    }
  }
});
