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
    Log.info(JSON.stringify(isMonitorOn));
    this.activateMonitor()
      .then(() => {
        Log.info("MMM-MotionDetector: monitor has been activated");
      })
      .catch((error) => {
        Log.error("MMM-MotionDetector: error activating monitor: " + error);
      });
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
   */
  isMonitorOn: async () => {
    try {
      const result = await exec("vcgencmd display_power");
      const isOn = result.stdout.includes("=1");
      Log.info("MMM-MotionDetector: monitor is " + (isOn ? "on" : "off"));
      return isOn;
    } catch (error) {
      Log.error("MMM-MotionDetector: error calling monitor status: " + error);
      return false;
    }
  },

  /**
   *
   * @param notification
   * @param payload
   */
  socketNotificationReceived: function (notification, payload) {
    if (notification === "MOTION_DETECTED") {
      Log.info("MMM-MotionDetector: MOTION_DETECTED, score is " + payload.score);
      this.activateMonitor()
        .then(() => {
          Log.info("MMM-MotionDetector: monitor has been activated");
        })
        .catch((error) => {
          Log.error("MMM-MotionDetector: error activating monitor: " + error);
        });
    }
    if (notification === "DEACTIVATE_MONITOR") {
      Log.info("MMM-MotionDetector: DEACTIVATE_MONITOR, percentage off: " + payload.percentageOff);
      this.deactivateMonitor()
        .then(() => {
          Log.info("MMM-MotionDetector: monitor has been deactivated");
        })
        .catch((error) => {
          Log.error("MMM-MotionDetector: error deactivating monitor: " + error);
        });
    }
  },
});
