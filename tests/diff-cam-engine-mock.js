const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");

const ENGINE_SOURCE = fs.readFileSync(path.join(__dirname, "..", "diff-cam-engine.js"), "utf8");

/**
 * Minimal 2d context. drawImage is a no-op, getImageData hands back whatever
 * frame the test queued up, so processDiff can be driven with known pixels.
 * @param frames queue of Uint8ClampedArray frames, consumed one per getImageData call
 * @returns {object} the fake context
 */
function createContext(frames) {
  return {
    calls: [],
    globalCompositeOperation: "source-over",
    strokeStyle: "",
    clearRect(...args) {
      this.calls.push(["clearRect", ...args]);
    },
    drawImage() {},
    getImageData(x, y, width, height) {
      const data = frames.length > 0 ? frames.shift() : new Uint8ClampedArray(width * height * 4);
      return { data, width, height };
    },
    putImageData() {},
    strokeRect(...args) {
      this.calls.push(["strokeRect", ...args]);
    },
  };
}

/**
 * Load diff-cam-engine.js outside of a browser.
 *
 * The engine reaches for window, document, navigator and setInterval on load,
 * so it runs in a vm context with all four faked. Captures are driven by hand
 * rather than by a real timer.
 * @param options.frames queue of diff frames returned by getImageData
 * @param options.tracks fake MediaStreamTracks the fake webcam hands out
 * @param options.getUserMedia override to simulate a denied or missing camera
 * @param options.init extra options passed through to DiffCamEngine.init
 * @returns {Promise<object>} handle exposing the engine and the fakes around it
 */
async function loadEngine({ frames = [], tracks = [], getUserMedia, init: initOptions = {} } = {}) {
  const queuedFrames = [...frames];
  const contexts = [];
  const stream = { getTracks: () => tracks };

  const video = {
    listeners: {},
    src: "",
    srcObject: null,
    addEventListener(event, handler) {
      this.listeners[event] = handler;
    },
    removeEventListener(event) {
      delete this.listeners[event];
    },
  };

  const createCanvas = () => ({
    height: 0,
    width: 0,
    getContext() {
      // init builds the capture, diff and motion contexts in that order, and
      // only the diff one is read back through processDiff
      const context = createContext(contexts.length === 1 ? queuedFrames : []);
      contexts.push(context);
      return context;
    },
    toDataURL: () => "data:image/jpeg;base64,stub",
  });

  let intervalCallback;
  const sandbox = {
    window: {},
    document: { createElement: (tag) => (tag === "video" ? video : createCanvas()) },
    navigator: {
      mediaDevices: {
        getUserMedia: getUserMedia || (() => Promise.resolve(stream)),
      },
    },
    clearInterval: () => {
      intervalCallback = undefined;
    },
    setInterval: (callback) => {
      intervalCallback = callback;
      return 1;
    },
  };
  sandbox.globalThis = sandbox;

  vm.createContext(sandbox);
  vm.runInContext(ENGINE_SOURCE, sandbox);

  const engine = sandbox.window.DiffCamEngine;
  const captures = [];
  let initError;

  await new Promise((resolve) => {
    engine.init({
      video,
      captureIntervalTime: 1000,
      // the diff results are built inside the vm realm, structuredClone brings
      // them back over so deepStrictEqual can be used on them
      captureCallback: (result) =>
        captures.push({ ...result, motionBox: structuredClone(result.motionBox) }),
      initErrorCallback: (error) => {
        initError = error;
        resolve();
      },
      initSuccessCallback: resolve,
      ...initOptions,
    });
  });

  return {
    captures,
    engine,
    initError,
    stream,
    video,
    /** Run start() and fire the canplay event the engine waits for. */
    startStreaming() {
      engine.start();
      video.listeners.canplay();
    },
    /** Drive one capture tick, the way the interval would. */
    tick() {
      if (!intervalCallback) {
        throw new Error("no capture interval registered, call startStreaming() first");
      }
      intervalCallback();
    },
    /** True once the capture interval has been cleared. */
    get isTicking() {
      return Boolean(intervalCallback);
    },
  };
}

/**
 * Build a diff frame where a given number of pixels differ enough to score.
 * @param pixelCount how many pixels should exceed the diff threshold
 * @param totalPixels size of the frame in pixels
 * @returns {Uint8ClampedArray} rgba frame data
 */
function frameWithMotionPixels(pixelCount, totalPixels = 64 * 48) {
  const data = new Uint8ClampedArray(totalPixels * 4);
  for (let pixel = 0; pixel < pixelCount; pixel++) {
    // green channel carries the most weight in the engine's diff formula
    data[pixel * 4 + 1] = 255;
    data[pixel * 4 + 3] = 255;
  }
  return data;
}

/**
 * Build a diff frame where exactly the given pixels differ enough to score.
 * @param pixels list of {x, y} coordinates that should exceed the diff threshold
 * @param width frame width in pixels
 * @param height frame height in pixels
 * @returns {Uint8ClampedArray} rgba frame data
 */
function frameWithMotionAt(pixels, width = 64, height = 48) {
  const data = new Uint8ClampedArray(width * height * 4);
  for (const { x, y } of pixels) {
    const offset = (y * width + x) * 4;
    data[offset + 1] = 255;
    data[offset + 3] = 255;
  }
  return data;
}

module.exports = { loadEngine, frameWithMotionAt, frameWithMotionPixels };
