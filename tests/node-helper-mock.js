const path = require("node:path");
const Module = require("node:module");
const util = require("node:util");

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

  // matches child_process.exec: the callback takes (error, stdout, stderr) as
  // separate string arguments
  const fakeExec = (command, callback) => {
    commands.push(command);
    try {
      const { stdout = "", stderr = "" } = execHandler(command) || {};
      callback(null, stdout, stderr);
    } catch (error) {
      callback(error);
    }
  };

  // the real exec carries this symbol, and util.promisify honours it to resolve
  // with { stdout, stderr } rather than with stdout alone. Without it the stub
  // would only look right by accident of how it calls back.
  fakeExec[util.promisify.custom] = (command) =>
    new Promise((resolve, reject) => {
      fakeExec(command, (error, stdout, stderr) => {
        if (error) {
          reject(error);
          return;
        }
        resolve({ stdout, stderr });
      });
    });

  const fakeChildProcess = { exec: fakeExec };

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
