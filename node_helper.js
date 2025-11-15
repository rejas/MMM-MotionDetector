const NodeHelper = require("node_helper");
const exec = require("util").promisify(require("child_process").exec);
const Log = require("../../js/logger");
const path = require("path");

module.exports = NodeHelper.create({

  /**
   * @param platform
   */
  initMonitor (platform) {
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
   *
   */
  async activateMonitor () {
    const scriptPath = this.getCommandScript();
    const isMonitorOn = await this.isMonitorOn();
    if (!isMonitorOn) {
      await exec(`bash ${scriptPath} on`);
    }
  },

  /**
   *
   */
  async deactivateMonitor () {
    const scriptPath = this.getCommandScript();
    const isMonitorOn = await this.isMonitorOn();
    if (isMonitorOn) {
      await exec(`bash ${scriptPath} off`);
    }
  },

  /**
   * @returns {Promise<boolean>}
   */
  async isMonitorOn () {
    const scriptPath = this.getCommandScript();
    const result = await exec(`bash ${scriptPath} status`);
    Log.info(`monitor is currently ${ result.stdout.trim()}.`);
    return result.stdout.trim() === "ON";
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
