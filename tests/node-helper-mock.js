const path = require("node:path");
const Module = require("node:module");

const HELPER_PATH = path.join(__dirname, "..", "node_helper.js");

/**
 * Load node_helper.js outside of a MagicMirror checkout.
 *
 * The helper pulls in "node_helper" and "../../js/logger", neither of which
 * exists when this repository is checked out on its own, and it shells out via
 * child_process. All three are swapped out through a temporary require hook.
 * @param options.exec handler receiving the command string, returns {stdout, stderr} or throws
 * @returns {{helper: object, commands: string[], logs: object}}
 */
function loadNodeHelper({ exec } = {}) {
  const commands = [];
  const logs = { error: [], info: [] };
  const execHandler = exec || (() => ({ stdout: "", stderr: "" }));

  const fakeChildProcess = {
    exec: (command, callback) => {
      commands.push(command);
      try {
        const { stdout = "", stderr = "" } = execHandler(command) || {};
        callback(null, { stdout, stderr });
      } catch (error) {
        callback(error);
      }
    },
  };

  const stubs = {
    node_helper: { create: (definition) => definition },
    "../../js/logger": {
      error: (message) => logs.error.push(message),
      info: (message) => logs.info.push(message),
    },
    child_process: fakeChildProcess,
    "node:child_process": fakeChildProcess,
  };

  const originalLoad = Module._load;
  Module._load = function (request, parent, isMain) {
    if (Object.hasOwn(stubs, request)) {
      return stubs[request];
    }
    return originalLoad.call(this, request, parent, isMain);
  };

  try {
    delete require.cache[require.resolve(HELPER_PATH)];
    const helper = require(HELPER_PATH);
    return { helper: Object.create(helper), commands, logs };
  } finally {
    Module._load = originalLoad;
  }
}

/**
 * Wait for the promise chains the helper kicks off without awaiting.
 * @returns {Promise<void>}
 */
function flush() {
  return new Promise((resolve) => setImmediate(resolve));
}

module.exports = { loadNodeHelper, flush };
