const NodeHelper = require("node_helper");
const exec = require("util").promisify(require("child_process").exec);
const Log = require("../../js/logger");
const path = require("path");

const VALID_PLATFORMS = ["x11", "cec", "labwc", "mac-arm", "mac-intel"];

module.exports = NodeHelper.create({

  /**
   * @param platform
   */
  initMonitor (platform) {
    if (!VALID_PLATFORMS.includes(platform)) {
      Log.error(`unknown platform "${platform}", must be one of: ${VALID_PLATFORMS.join(", ")}.`);
      return;
    }
    this.platform = platform;
    this.activateMonitor()
      .then(() => Log.info("monitor has been initially activated."))
      .catch((result) => Log.error(`error activating monitor initially: ${result.stderr}.`));
    },

  /**
   * Get the command script path based on platform option
   */
  getCommandScript () {
    const platform = this.platform || "x11";
    return path.join(__dirname, `monitor-commands-${platform}.sh`);
  },

  /**
   * Turns the monitor on. The underlying scripts are idempotent, so no
   * status check is needed beforehand.
   */
  async activateMonitor () {
    const scriptPath = this.getCommandScript();
    await exec(`bash ${scriptPath} on`);
  },

  /**
   * Turns the monitor off. The underlying scripts are idempotent, so no
   * status check is needed beforehand.
   */
  async deactivateMonitor () {
    const scriptPath = this.getCommandScript();
    await exec(`bash ${scriptPath} off`);
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
      this.activateMonitor()
        .then(() => Log.info("monitor has been activated."))
        .catch((result) => Log.error(`error activating monitor: ${result.stderr}`));
    }
    if (notification === "DEACTIVATE_MONITOR") {
      Log.info("deactivating monitor");
      this.deactivateMonitor()
        .then(() => Log.info("monitor has been deactivated."))
        .catch((result) => Log.error(`error deactivating monitor: ${result.stderr}`));
    }
  }
});
