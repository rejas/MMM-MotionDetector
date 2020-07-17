const NodeHelper = require("node_helper");
const exec = require("child_process").exec;
const Log = require("../../js/logger");

module.exports = NodeHelper.create({
  config: null,

  start: function () {
    this.isMonitorOn(function (result) {
      Log.info("MMM-MotionDetector: monitor is " + (result ? "ON" : "OFF") + ".");
    });
  },

  activateMonitor: function () {
    this.isMonitorOn(function (result) {
      if (!result) {
        exec("vcgencmd display_power 1", function (err, out, code) {
          if (err) {
            Log.error("MMM-MotionDetector: error activating monitor: " + code);
          } else {
            Log.info("MMM-MotionDetector: monitor has been activated.");
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
            Log.error("MMM-MotionDetector: error deactivating monitor: " + code);
          } else {
            Log.info("MMM-MotionDetector: monitor has been deactivated.");
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

      Log.info("MMM-MotionDetector: monitor status is " + out);
      resultCallback(out.includes("=1"));
    });
  },

  socketNotificationReceived: function (notification, payload) {
    if (notification === "ACTIVATE_MONITOR") {
      Log.info("MMM-MotionDetector: activating monitor.");
      this.activateMonitor();
    }
    if (notification === "DEACTIVATE_MONITOR") {
      Log.info("MMM-MotionDetector: deactivating monitor.");
      this.deactivateMonitor();
    }
    if (notification === "MOTION_CONFIG") {
			this.config = payload;
			console.log(this.name + " configured.");
    }
    if (this.config.debug) {
			console.log(this.name + " Notification received.");
		}
  },

  notificationReceived: function (notification, payload) {
		if (this.config != null && this.config.debug) {
			console.log(this.name + " Notification broadcast received: " + notification);
		}
	}

});
