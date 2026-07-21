const NodeHelper = require("node_helper");
const execFile = require("util").promisify(require("child_process").execFile);
const Log = require("../../js/logger");
const path = require("path");

const VALID_PLATFORMS = ["x11", "cec", "labwc", "mac-arm", "mac-intel"];

/**
 * Describe a failed monitor command. A script that ran and failed carries
 * stderr, while a failure to spawn bash at all only carries a message.
 * @param error rejection from the promisified execFile
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
   * Queue a monitor command behind the previous one.
   *
   * The scripts are idempotent, so no status check is needed, but they are not
   * instant. Firing on and off concurrently lets a slow off land after a later
   * on and leave the screen dark, and the module never retries because it has
   * already recorded the monitor as awake. Running them one at a time keeps the
   * last requested state the one that wins.
   * @param action either "on" or "off"
   * @returns {Promise<void>}
   */
  runMonitorCommand (action) {
    // execFile takes the arguments as a list, so no shell parses the path and
    // directories containing spaces or metacharacters are handled correctly
    const run = () => execFile("bash", [this.getCommandScript(), action]);
    const next = this.pendingCommand ? this.pendingCommand.then(run, run) : run();

    // the chain must survive a failing command, or every later toggle rejects
    this.pendingCommand = next.catch(() => {});
    return next;
  },

  /**
   * Turns the monitor on.
   * @returns {Promise<void>}
   */
  async activateMonitor () {
    if (!this.hasValidPlatform()) {
      throw new Error("no valid platform has been configured");
    }
    await this.runMonitorCommand("on");
  },

  /**
   * Turns the monitor off.
   * @returns {Promise<void>}
   */
  async deactivateMonitor () {
    if (!this.hasValidPlatform()) {
      throw new Error("no valid platform has been configured");
    }
    await this.runMonitorCommand("off");
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
