const NodeHelper = require("node_helper");
const exec = require("child_process").exec;

module.exports = NodeHelper.create({
  start: function () {
    this.isMonitorOn(function (result) {
      console.log("MMM-MotionDetector: monitor on " + result);
    });
  },

  activateMonitor: function () {
    this.isMonitorOn(function (result) {
      if (!result) {
        exec("vcgencmd display_power 1", function (err, out, code) {
          if (err) {
            console.error(
              "MMM-MotionDetector: error activating monitor: " + code
            );
          } else {
            console.log("MMM-MotionDetector: monitor has been activated");
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
            console.error(
              "MMM-MotionDetector: error deactivating monitor: " + code
            );
          } else {
            console.log("MMM-MotionDetector: monitor has been deactivated");
          }
        });
      }
    });
  },

  isMonitorOn: function (resultCallback) {
    exec("vcgencmd display_power", function (err, out, code) {
      if (err) {
        console.error(
          "MMM-MotionDetector: error calling monitor status: " + code
        );
        return;
      }

      console.log("MMM-MotionDetector: monitor " + out);
      resultCallback(out.includes("=1"));
    });
  },

  socketNotificationReceived: function (notification, payload) {
    if (notification === "MOTION_DETECTED") {
      console.log(
        "MMM-MotionDetector: MOTION_DETECTED, score " + payload.score
      );
      this.activateMonitor();
    }
    if (notification === "DEACTIVATE_MONITOR") {
      console.log(
        "MMM-MotionDetector: DEACTIVATE_MONITOR, percentage off: " +
          payload.percentageOff
      );
      this.deactivateMonitor();
    }
  }
});
