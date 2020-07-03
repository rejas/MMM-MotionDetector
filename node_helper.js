const NodeHelper = require("node_helper");
const exec = require("child_process").exec;
const Log = require("../../js/logger");

module.exports = NodeHelper.create({
  start: function () {
    this.isMonitorOn(function (result) {
      Log.info("MMM-MotionDetector: monitor on " + result);
    });
  },

  activateMonitor: function () {
    this.isMonitorOn(function (result) {
      if (!result) {
        exec("vcgencmd display_power 1", function (err, out, code) {
          if (err) {
            Log.error("MMM-MotionDetector: error activating monitor: " + code);
          } else {
            Log.info("MMM-MotionDetector: monitor has been activated");
          }
        });
      }
    });
  },

  deactivateMonitor: function () {
    this.isMonitorOn(function (result) {
      if (result) {
        exec("vcgencmd display_power 0", function (err, out, code) {
          if (err) {
            Log.error(
              "MMM-MotionDetector: error deactivating monitor: " + code
            );
          } else {
            Log.info("MMM-MotionDetector: monitor has been deactivated");
          }
        });
      }
    });
  },

  isMonitorOn: function (resultCallback) {
    exec("vcgencmd display_power", function (err, out, code) {
      if (err) {
        Log.error("MMM-MotionDetector: error calling monitor status: " + code);
        return;
      }

      Log.info("MMM-MotionDetector: monitor " + out);
      resultCallback(out.includes("=1"));
    });
  },

  socketNotificationReceived: function (notification, payload) {
    if (notification === "MOTION_DETECTED") {
      Log.info("MMM-MotionDetector: MOTION_DETECTED, score " + payload.score);
      this.activateMonitor();
    }
    if (notification === "DEACTIVATE_MONITOR") {
      Log.info(
        "MMM-MotionDetector: DEACTIVATE_MONITOR, percentage off: " +
          payload.percentageOff
      );
      this.deactivateMonitor();
    }
  }
});
