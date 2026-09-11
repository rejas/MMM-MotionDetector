const NodeHelper = require("node_helper");
const childProcess = require("child_process");
const execFile = require("util").promisify(childProcess.execFile);
const spawn = childProcess.spawn;
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

  startV4L2 (config) {
    this.v4l2Config = config;
    this.v4l2FrameBuffer = Buffer.alloc(0);
    this.v4l2PreviousFrame = null;
    this.v4l2IgnoreNextFrame = false;
    this.v4l2LastMotionAt = Date.now();
    this.v4l2MonitorOn = true;

    if (this.v4l2Process) {
      this.v4l2Process.kill("SIGTERM");
      this.v4l2Process = null;
    }

    const width = 160;
    const height = 120;
    this.v4l2FrameSize = width * height;

    const interval = Math.max(
      200,
      Number(config.captureIntervalTime) || 1000
    );

    const fps = 1000 / interval;

    const args = [
      "-hide_banner",
      "-loglevel", "error",
      "-f", "v4l2",
      "-video_size", "320x240",
      "-i", config.cameraDevice || "/dev/video0",
      "-vf", `fps=${fps},scale=${width}:${height},format=gray`,
      "-f", "rawvideo",
      "-pix_fmt", "gray",
      "pipe:1"
    ];

    Log.info(
      `starting V4L2 camera ${config.cameraDevice || "/dev/video0"} (${fps.toFixed(2)} fps).`
    );

    this.v4l2Process = spawn("ffmpeg", args, {
      stdio: ["ignore", "pipe", "pipe"]
    });

    this.v4l2Process.stdout.on("data", (chunk) => {
      this.v4l2FrameBuffer = Buffer.concat([
        this.v4l2FrameBuffer,
        chunk
      ]);

      while (this.v4l2FrameBuffer.length >= this.v4l2FrameSize) {
        const frame = this.v4l2FrameBuffer.subarray(
          0,
          this.v4l2FrameSize
        );

        this.v4l2FrameBuffer = this.v4l2FrameBuffer.subarray(
          this.v4l2FrameSize
        );

        this.processV4L2Frame(frame);
      }
    });

    this.v4l2Process.stderr.on("data", (data) => {
      const message = data.toString().trim();

      if (message) {
        Log.error(`V4L2 ffmpeg: ${message}`);
      }
    });

    this.v4l2Process.on("error", (error) => {
      Log.error(`V4L2 camera failed: ${error.message}`);

      this.sendSocketNotification("V4L2_CAMERA_ERROR", {
        error: error.message
      });
    });

    this.v4l2Process.on("exit", (code, signal) => {
      Log.warn(
        `V4L2 ffmpeg exited (code=${code}, signal=${signal}).`
      );

      this.v4l2Process = null;
    });

    this.sendSocketNotification("V4L2_CAMERA_STARTED", {
      device: config.cameraDevice || "/dev/video0"
    });
  },

  processV4L2Frame (frame) {
    if (!this.v4l2PreviousFrame) {
      this.v4l2PreviousFrame = Buffer.from(frame);
      return;
    }

    const config = this.v4l2Config;

    let score = 0;
    let brighter = 0;
    let darker = 0;
    let brightnessDeltaSum = 0;

    const pixelThreshold =
      Number(config.pixelDiffThreshold) || 30;

    for (let i = 0; i < frame.length; i++) {
      const delta = frame[i] - this.v4l2PreviousFrame[i];
      const absDelta = Math.abs(delta);

      brightnessDeltaSum += delta;

      if (absDelta >= pixelThreshold) {
        score++;

        if (delta > 0) {
          brighter++;
        } else {
          darker++;
        }
      }
    }

    const averageBrightnessDelta =
      brightnessDeltaSum / frame.length;

    const changedPixelRatio =
      score / frame.length;

    const dominantDirection =
      score > 0
        ? Math.max(brighter, darker) / score
        : 0;

    const isLightChange =
      Math.abs(averageBrightnessDelta) >=
        (Number(config.lightChangeThreshold) || 12) &&
      changedPixelRatio >=
        (Number(config.lightChangePixelRatio) || 0.55) &&
      dominantDirection >=
        (Number(config.lightChangeDirectionRatio) || 0.80);

    this.v4l2PreviousFrame = Buffer.from(frame);

    if (isLightChange) {
      Log.info(
        `light change ignored ` +
        `(brightness=${averageBrightnessDelta.toFixed(1)}, ` +
        `pixels=${Math.round(changedPixelRatio * 100)}%, ` +
        `direction=${Math.round(dominantDirection * 100)}%).`
      );

      this.v4l2IgnoreNextFrame = true;
      return;
    }

    if (this.v4l2IgnoreNextFrame) {
      this.v4l2IgnoreNextFrame = false;
      Log.info("stabilization frame ignored.");
      return;
    }

    const hasMotion =
      score >= Number(config.scoreThreshold);

    if (hasMotion) {
      this.v4l2LastMotionAt = Date.now();

      Log.info(`Motion detected, score: ${score}`);

      this.sendSocketNotification("V4L2_MOTION_STATUS", {
        score,
        hasMotion: true,
        monitorOn: this.v4l2MonitorOn
      });

      if (!this.v4l2MonitorOn) {
        this.v4l2MonitorOn = true;

        this.activateMonitor()
          .then(() => Log.info("monitor has been activated."))
          .catch((error) => {
            this.v4l2MonitorOn = false;
            Log.error(
              `error activating monitor: ${describeError(error)}`
            );
          });
      }

      return;
    }

    this.sendSocketNotification("V4L2_MOTION_STATUS", {
      score,
      hasMotion: false,
      monitorOn: this.v4l2MonitorOn
    });

    if (
      config.autoHideOnNoMotion !== false &&
      Number(config.timeout) >= 0 &&
      Date.now() - this.v4l2LastMotionAt > Number(config.timeout) &&
      this.v4l2MonitorOn
    ) {
      this.v4l2MonitorOn = false;

      Log.info("deactivating monitor");

      this.deactivateMonitor()
        .then(() => Log.info("monitor has been deactivated."))
        .catch((error) => {
          this.v4l2MonitorOn = true;
          Log.error(
            `error deactivating monitor: ${describeError(error)}`
          );
        });
    }
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
    if (notification === "INIT_V4L2" && payload) {
      Log.info("initialising V4L2 motion backend.");
      this.startV4L2(payload);
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
