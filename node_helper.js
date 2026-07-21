const NodeHelper = require("node_helper");
const execFile = require("util").promisify(require("child_process").execFile);
const Log = require("../../js/logger");
const path = require("path");

const VALID_PLATFORMS = ["x11", "cec", "labwc", "mac-arm", "mac-intel"];

/**
 * Describe a failed exec. A script that ran and failed carries stderr, while a
 * failure to spawn it at all only carries a message.
 * @param error rejection from exec
 * @returns {string}
 */
function describeError (error) {
  const stderr = error && error.stderr ? String(error.stderr).trim() : "";
  return stderr || (error && error.message) || String(error);
}

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
      .catch((error) => Log.error(`error activating monitor initially: ${describeError(error)}.`));
    },

  /**
   * Whether initMonitor accepted a platform. Without one there is no script to
   * run, and guessing a default would defeat the validation in initMonitor.
   * @returns {boolean}
   */
  hasValidPlatform () {
    return VALID_PLATFORMS.includes(this.platform);
  },

  /**
   * Get the command script path based on platform option
   */
  getCommandScript () {
    return path.join(__dirname, `monitor-commands-${this.platform}.sh`);
  },

  /**
   * Turns the monitor on. The underlying scripts are idempotent, so no
   * status check is needed beforehand.
   */
  async activateMonitor () {
    if (!this.hasValidPlatform()) {
      Log.error("cannot activate monitor, no valid platform has been configured.");
      return;
    }
    // execFile takes the arguments as a list, so no shell parses the path and
    // directories containing spaces or metacharacters are handled correctly
    await execFile("bash", [this.getCommandScript(), "on"]);
  },

  /**
   * Turns the monitor off. The underlying scripts are idempotent, so no
   * status check is needed beforehand.
   */
  async deactivateMonitor () {
    if (!this.hasValidPlatform()) {
      Log.error("cannot deactivate monitor, no valid platform has been configured.");
      return;
    }
    await execFile("bash", [this.getCommandScript(), "off"]);
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
        .catch((error) => Log.error(`error activating monitor: ${describeError(error)}`));
    }
    if (notification === "DEACTIVATE_MONITOR") {
      Log.info("deactivating monitor");
      this.deactivateMonitor()
        .then(() => Log.info("monitor has been deactivated."))
        .catch((error) => Log.error(`error deactivating monitor: ${describeError(error)}`));
    }
  }
});
