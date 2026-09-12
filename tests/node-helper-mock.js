const path = require("node:path");
const Module = require("node:module");
const util = require("node:util");
const { EventEmitter } = require("node:events");

const HELPER_PATH = path.join(__dirname, "..", "node_helper.js");

/**
 * Build a fake child process good enough to stand in for the ffmpeg process
 * spawned by the V4L2 backend: an EventEmitter with stdout/stderr streams
 * (also EventEmitters) and a kill() that records the signal and exits immediately.
 * Tests can override kill() to model delayed termination and drive stream events.
 * @returns {EventEmitter}
 */
function createFakeProcess() {
  const proc = new EventEmitter();
  proc.stdout = new EventEmitter();
  proc.stderr = new EventEmitter();
  proc.killSignals = [];
  proc.kill = (signal) => {
    proc.killSignals.push(signal);
    proc.emit("exit", null, signal);
    return true;
  };
  return proc;
}

/**
 * Load node_helper.js outside of a MagicMirror checkout.
 *
 * The helper pulls in "node_helper" and "../../js/logger", neither of which
 * exists when this repository is checked out on its own, and it runs the
 * monitor scripts through child_process.execFile and the V4L2 backend through
 * child_process.spawn. All are swapped out through a temporary require hook.
 * @param options.run stands in for a command run, receives the command as one
 * string for convenience, returns {stdout, stderr} or throws
 * @param options.spawn stands in for child_process.spawn(command, args, options),
 * receives the same arguments, returns a fake process (defaults to createFakeProcess())
 * @returns {{helper: object, calls: object[], commands: string[], logs: object, notifications: object[], spawnCalls: object[]}}
 */
function loadNodeHelper({ run, spawn } = {}) {
  const commands = [];
  const calls = [];
  const logs = { error: [], info: [], warn: [] };
  const notifications = [];
  const spawnCalls = [];
  const runHandler = run || (() => ({ stdout: "", stderr: "" }));
  const spawnHandler = spawn || (() => createFakeProcess());

  // matches child_process.execFile: arguments arrive as a list and the callback
  // takes (error, stdout, stderr) as separate string arguments
  const fakeExecFile = (file, args, callback) => {
    calls.push({ file, args });
    commands.push([file, ...args].join(" "));

    let result;
    try {
      result = runHandler([file, ...args].join(" "));
    } catch (error) {
      callback(error);
      return;
    }

    // the real execFile never calls back synchronously, and a handler may
    // return a promise to model a command that takes a while to finish
    Promise.resolve(result).then(
      ({ stdout = "", stderr = "" } = {}) => callback(null, stdout, stderr),
      (error) => callback(error)
    );
  };

  // the real execFile carries this symbol, and util.promisify honours it to
  // resolve with { stdout, stderr } rather than with stdout alone. Without it
  // the stub would only look right by accident of how it calls back.
  fakeExecFile[util.promisify.custom] = (file, args) =>
    new Promise((resolve, reject) => {
      fakeExecFile(file, args, (error, stdout, stderr) => {
        if (error) {
          reject(error);
          return;
        }
        resolve({ stdout, stderr });
      });
    });

  const fakeSpawn = (command, args, options) => {
    const proc = spawnHandler(command, args, options);
    spawnCalls.push({ command, args, options, proc });
    return proc;
  };

  const fakeChildProcess = { execFile: fakeExecFile, spawn: fakeSpawn };

  const stubs = {
    node_helper: { create: (definition) => definition },
    "../../js/logger": {
      error: (message) => logs.error.push(message),
      info: (message) => logs.info.push(message),
      warn: (message) => logs.warn.push(message),
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
    const definition = require(HELPER_PATH);
    const helper = Object.create(definition);

    // the real NodeHelper base class provides this; sendSocketNotification
    // calls are recorded here instead of actually going over a socket
    helper.sendSocketNotification = (notification, payload) => {
      notifications.push({ notification, payload });
    };

    return { helper, calls, commands, logs, notifications, spawnCalls };
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

module.exports = { loadNodeHelper, flush, createFakeProcess };
