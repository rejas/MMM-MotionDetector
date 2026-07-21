const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");

const MODULE_SOURCE = fs.readFileSync(path.join(__dirname, "..", "MMM-MotionDetector.js"), "utf8");

/**
 * Load MMM-MotionDetector.js outside of a browser.
 *
 * The interesting logic lives inside the callbacks handed to DiffCamEngine.init(),
 * so we stub the engine out and keep the options object it receives. That gives us
 * a handle on captureCallback, which can then be driven frame by frame.
 * @param config config overrides merged over the module defaults
 * @returns {{module: object, capture: Function, initError: Function}}
 */
function loadModule(config = {}) {
  let definition;
  let engineOptions;

  const sandbox = {
    Module: {
      register: (name, moduleDefinition) => {
        definition = moduleDefinition;
      },
    },
    Log: { error() {}, info() {} },
    moment: { duration: () => ({ humanize: () => "a while" }) },
    document: { createElement: () => ({ appendChild() {}, style: "" }) },
    DiffCamEngine: {
      init: (options) => {
        engineOptions = options;
      },
      start() {},
    },
  };

  vm.createContext(sandbox);
  vm.runInContext(MODULE_SOURCE, sandbox);

  const module = Object.assign(Object.create(definition), definition, {
    config: { ...definition.defaults, ...config },
    data: { position: "top_left" },
    notifications: [],
    sendNotification(notification, payload) {
      // payloads are built inside the vm realm, structuredClone brings them back over
      this.notifications.push(["notification", notification, structuredClone(payload)]);
    },
    sendSocketNotification(notification, payload) {
      this.notifications.push(["socket", notification, structuredClone(payload)]);
    },
    updateDom() {},
  });

  module.start();

  // start() emits INIT_MONITOR, tests care about what happens afterwards
  module.notifications.length = 0;

  return { module, capture: engineOptions.captureCallback, initError: engineOptions.initErrorCallback };
}

/**
 * Pretend the last motion happened a given number of milliseconds ago.
 * @param module module instance returned by loadModule
 * @param milliseconds age of the last detected motion
 */
function setLastMotionAge(module, milliseconds) {
  module.lastTimeMotionDetected = new Date(Date.now() - milliseconds);
}

module.exports = { loadModule, setLastMotionAge };
