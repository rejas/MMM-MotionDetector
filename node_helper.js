const NodeHelper = require("node_helper");
const childProcess = require("child_process");
const exec = require("util").promisify(childProcess.exec);
const Log = require("../../js/logger");

module.exports = NodeHelper.create({
  /**
   *
   */
  start: function () {
    const isMonitorOn = this.isMonitorOn();
    Log.info("MMM-MotionDetector: monitor is " + (isMonitorOn ? "ON" : "OFF") + ".");
  },

  /**
   *
   */
  activateMonitor: async function () {
    const isMonitorOn = this.isMonitorOn();
    if (!isMonitorOn) {
      await exec("vcgencmd display_power 1");
    }
  },

  /**
   *
   */
  deactivateMonitor: async function () {
    const isMonitorOn = this.isMonitorOn();
    if (isMonitorOn) {
      await exec("vcgencmd display_power 0");
    }
  },

  /**
   *
   * @param resultCallback
   */
  isMonitorOn: async () => {
    try {
      const out = await exec("vcgencmd display_power");
      Log.info("MMM-MotionDetector: monitor status is " + out);
      return out.includes("=1");
    } catch (error) {
      Log.error("MMM-MotionDetector: error calling monitor status: " + code);
      return false;
    }
  },

  /**
   *
   * @param notification
   * @param payload
   */
  // Subclass socketNotificationReceived received.
  socketNotificationReceived: function (notification, payload) {
    if (notification === "MOTION_DETECTED") {
      console.log("MMM-MotionDetector: MOTION_DETECTED, score " + payload.score);
      this.activateMonitor()
        .then(() => {
          console.log("MMM-MotionDetector: monitor has been activated");
        })
        .catch((error) => {
          console.error("MMM-MotionDetector: error activating monitor: " + error);
        });
    }
    if (notification === "DEACTIVATE_MONITOR") {
      console.log("MMM-MotionDetector: DEACTIVATE_MONITOR, percentage off: " + payload.percentageOff);
      this.deactivateMonitor()
        .then(() => {
          console.log("MMM-MotionDetector: monitor has been deactivated");
        })
        .catch((error) => {
          console.error("MMM-MotionDetector: error deactivating monitor: " + error);
        });
    }
  },
});
