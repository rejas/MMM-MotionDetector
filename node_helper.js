const NodeHelper = require("node_helper");
const util = require("util");
const exec = util.promisify(require("child_process").exec);
const Log = require("../../js/logger");

module.exports = NodeHelper.create({
  /**
   *
   */
  start: function () {
    this.systems = [
      {
        name: "vcgencmd",
        activate: async () => {
          await exec("vcgencmd display_power 1");
        },
        deactivate: async () => {
          await exec("vcgencmd display_power 0");
        },
        status: async () => {
          const { stdout } = await exec("vcgencmd display_power");
          return stdout.includes("=1");
        },
      },
      {
        name: "mac",
        activate: async () => {
          await exec("caffeinate -u -t 1");
        },
        deactivate: async () => {
          await exec("pmset displaysleepnow");
        },
        status: async () => {
          const { stdout } = await exec("pmset -g powerstate IODisplayWrangler | tail -1 | cut -c29");
          return stdout.includes("4");
        },
      },
      {
        name: "cec",
        activate: async () => {
          await exec("echo on 0 | cec-client -s -d 1 ");
        },
        deactivate: async () => {
          await exec("echo standby 0 | cec-client -s -d 1");
        },
        status: async () => {
          const { stdout } = await exec("pmset -g powerstate IODisplayWrangler | tail -1 | cut -c29");
          return stdout.includes("4");
        },
      },
    ];
  },

  /**
   * @param system
   */
  initMonitor: function (system) {
    this.currentSystem = this.systems.filter((s) => s.name === system)[0];

    if (!this.currentSystem) {
      Log.error("MMM-MotionDetector: wrong system config " + system);
      return;
    }

    this.activateMonitor();

    this.isMonitorOn(function (result) {
      Log.info("MMM-MotionDetector: monitor is " + (result ? "ON" : "OFF") + ".");
    });
  },

  /**
   *
   */
  activateMonitor: function () {
    this.isMonitorOn((result) => {
      if (!result) {
        this.currentSystem
          .deactivate()
          .then((result) => {
            Log.info("MMM-MotionDetector: monitor has been activated.");
          })
          .catch((err) => {
            Log.error("MMM-MotionDetector: error activating monitor: " + err);
          });
      }
    });
  },

  /**
   *
   */
  deactivateMonitor: function () {
    this.isMonitorOn((result) => {
      if (result) {
        this.currentSystem
          .deactivate()
          .then((result) => {
            Log.info("MMM-MotionDetector: monitor has been deactivated.");
          })
          .catch((err) => {
            Log.error("MMM-MotionDetector: error deactivating monitor: " + err);
          });
      }
    });
  },

  /**
   *
   * @param resultCallback
   */
  isMonitorOn: function (resultCallback) {
    this.currentSystem
      .status()
      .then((result) => {
        Log.info("MMM-MotionDetector: monitor status is " + result);
        resultCallback(true);
      })
      .catch((err) => {
        Log.error("MMM-MotionDetector: error calling monitor status: " + err);
        resultCallback(false);
      });
  },

  /**
   *
   * @param notification
   * @param payload
   */
  socketNotificationReceived: function (notification, payload) {
    if (notification === "INIT_MONITOR") {
      Log.info("MMM-MotionDetector: initialising.");
      this.initMonitor(payload.system);
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
