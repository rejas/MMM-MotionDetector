const NodeHelper = require("node_helper");
const childProcess = require("child_process");
const execFile = require("util").promisify(childProcess.execFile);
const spawn = childProcess.spawn;
const Log = require("../../js/logger");
const path = require("path");

const VALID_PLATFORMS = ["x11", "cec", "labwc", "mac-arm", "mac-intel"];
// While the monitor is off, a candidate this large may be an early auto exposure
// step. The ratio only selects candidates for confirmation; it never classifies light.
const WAKE_CONFIRMATION_PIXEL_RATIO = 0.25;
const WAKE_CONFIRMATION_FRAMES = 3;
const WAKE_LIGHT_CHANGE_PIXEL_RATIO = 0.3;

function ratioOption (value, fallback) {
  const ratio = toConfigNumber(value, fallback);
  return ratio >= 0 && ratio <= 1 ? ratio : fallback;
}

function wakeConfirmationPixelRatio (config) {
  return ratioOption(config.wakeConfirmationPixelRatio, WAKE_CONFIRMATION_PIXEL_RATIO);
}

function wakeLightChangePixelRatio (config) {
  return ratioOption(config.wakeLightChangePixelRatio, WAKE_LIGHT_CHANGE_PIXEL_RATIO);
}

function wakeConfirmationFrames (config) {
  const frames = toConfigNumber(config.wakeConfirmationFrames, WAKE_CONFIRMATION_FRAMES);
  return Number.isInteger(frames) && frames >= 1 ? frames : WAKE_CONFIRMATION_FRAMES;
}

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

/**
 * Coerce a config value to a finite number, falling back only when the value
 * is missing or cannot be interpreted as a number. Unlike `Number(x) || fallback`,
 * this keeps an explicit 0 (and negative numbers) instead of silently
 * replacing them with the fallback.
 * @param value raw config value
 * @param fallback used for undefined, null, NaN or non-numeric input
 * @returns {number}
 */
function toConfigNumber (value, fallback) {
  if (value === undefined || value === null) {
    return fallback;
  }
  const num = Number(value);
  return Number.isFinite(num) ? num : fallback;
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
   * Stop the running ffmpeg process, if any, and mark its termination as
   * intentional so the "exit" handler does not report it as a camera error.
   */
  stopV4L2 () {
    this.v4l2PendingMotionScore = 0;
    if (!this.v4l2Process) {
      return;
    }

    const proc = this.v4l2Process;
    if (proc.v4l2Intentional) {
      return;
    }
    proc.v4l2Intentional = true;
    proc.v4l2StopTimer = setTimeout(() => {
      if (this.v4l2Process === proc) {
        proc.kill("SIGKILL");
      }
    }, 2000);
    proc.v4l2StopTimer.unref();
    proc.kill("SIGTERM");
  },

  stop () {
    this.v4l2PendingConfig = null;
    this.stopV4L2();
  },

  startV4L2 (config) {
    // A delivered signal does not prove that the old camera released its device.
    // Keep only the latest request and start it after the old process exits.
    if (this.v4l2Process) {
      this.v4l2PendingConfig = config;
      this.stopV4L2();
      return;
    }
    this.v4l2Config = config;

    this.v4l2FrameBuffer = Buffer.alloc(0);
    this.v4l2PreviousFrame = null;
    this.v4l2IgnoreNextFrame = false;
    this.v4l2PendingMotionScore = 0;
    this.v4l2LastMotionAt = Date.now();
    this.v4l2MonitorOn ??= true;

    const width = 160;
    const height = 120;
    this.v4l2FrameSize = width * height;

    const interval = Math.max(
      200,
      toConfigNumber(config.captureIntervalTime, 1000)
    );

    const fps = 1000 / interval;
    const device = config.cameraDevice || "/dev/video0";

    const args = [
      "-hide_banner",
      "-loglevel", "error",
      "-f", "v4l2",
      "-video_size", "320x240",
      "-i", device,
      "-vf", `fps=${fps},scale=${width}:${height},format=gray`,
      "-f", "rawvideo",
      "-pix_fmt", "gray",
      "pipe:1"
    ];

    Log.info(
      `starting V4L2 camera ${device} (${fps.toFixed(2)} fps).`
    );

    const proc = spawn("ffmpeg", args, {
      stdio: ["ignore", "pipe", "pipe"]
    });

    this.v4l2Process = proc;
    proc.v4l2Started = false;

    proc.stdout.on("data", (chunk) => {
      // a process that was replaced by a later restart may still have
      // buffered events in flight; its data must not feed the new process's
      // frame buffer
      if (this.v4l2Process !== proc || proc.v4l2Intentional || proc.v4l2Failed) {
        return;
      }

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

        if (!proc.v4l2Started) {
          proc.v4l2Started = true;

          // only now is it proven that the device and ffmpeg actually
          // produce usable frames, rather than just that spawn() succeeded
          Log.info(`V4L2 camera started: ${device}`);
          this.sendSocketNotification("V4L2_CAMERA_STARTED", { device });
        }

        this.processV4L2Frame(frame);
      }
    });

    proc.stderr.on("data", (data) => {
      if (this.v4l2Process !== proc || proc.v4l2Intentional || proc.v4l2Failed) {
        return;
      }

      const message = data.toString().trim();

      if (message) {
        Log.error(`V4L2 ffmpeg: ${message}`);
      }
    });

    proc.on("error", (error) => {
      if (this.v4l2Process !== proc || proc.v4l2Intentional || proc.v4l2Failed) {
        return;
      }
      proc.v4l2Failed = true;
      this.v4l2PendingMotionScore = 0;
      Log.error(`V4L2 camera failed: ${error.message}`);
      this.sendSocketNotification("V4L2_CAMERA_ERROR", {
        error: error.message
      });
    });

    const finished = (code, signal) => {
      if (this.v4l2Process !== proc) {
        return;
      }
      clearTimeout(proc.v4l2StopTimer);
      this.v4l2Process = null;
      this.v4l2FrameBuffer = Buffer.alloc(0);
      this.v4l2PreviousFrame = null;
      this.v4l2PendingMotionScore = 0;

      if (!proc.v4l2Intentional && !proc.v4l2Failed) {
        Log.error(
          `V4L2 ffmpeg exited unexpectedly (code=${code}, signal=${signal}).`
        );
        this.sendSocketNotification("V4L2_CAMERA_ERROR", {
          error: `ffmpeg exited unexpectedly (code=${code}, signal=${signal})`
        });
      }
      const pending = this.v4l2PendingConfig;
      this.v4l2PendingConfig = null;
      if (pending) {
        this.startV4L2(pending);
      }
    };
    proc.on("exit", finished);
    // Failed spawns emit close without necessarily emitting exit.
    proc.on("close", finished);
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
      toConfigNumber(config.pixelDiffThreshold, 30);

    for (let i = 0; i < frame.length; i++) {
      const delta = frame[i] - this.v4l2PreviousFrame[i];
      const absDelta = Math.abs(delta);

      brightnessDeltaSum += delta;

      // a delta of zero means the pixel is identical to the previous frame,
      // which is never significant, not even at a pixelDiffThreshold of zero
      if (absDelta > 0 && absDelta >= pixelThreshold) {
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

    const lightChangeThreshold =
      toConfigNumber(config.lightChangeThreshold, 12);
    const lightChangeDirectionRatio =
      toConfigNumber(config.lightChangeDirectionRatio, 0.80);
    const scoreThreshold = toConfigNumber(config.scoreThreshold, 20);

    const isLightChange =
      Math.abs(averageBrightnessDelta) >= lightChangeThreshold &&
      changedPixelRatio >=
        toConfigNumber(config.lightChangePixelRatio, 0.55) &&
      dominantDirection >= lightChangeDirectionRatio;

    this.v4l2PreviousFrame = Buffer.from(frame);
    const pendingMotionScore = this.v4l2PendingMotionScore || 0;
    const frameStats = () =>
      `(score=${score}, pixels=${(changedPixelRatio * 100).toFixed(1)}%, ` +
      `brightness=${averageBrightnessDelta.toFixed(1)}, ` +
      `direction=${(dominantDirection * 100).toFixed(1)}%)`;

    if (isLightChange) {
      Log.info(
        `light change ignored ` +
        `(brightness=${averageBrightnessDelta.toFixed(1)}, ` +
        `pixels=${Math.round(changedPixelRatio * 100)}%, ` +
        `direction=${Math.round(dominantDirection * 100)}%).`
      );

      if (pendingMotionScore > 0) {
        this.v4l2PendingMotionScore = 0;
        Log.info("held-back wake discarded by light change.");
      }
      this.v4l2IgnoreNextFrame = true;
      this.processV4L2NoMotion(score, false);
      return;
    }

    if (this.v4l2IgnoreNextFrame) {
      this.v4l2IgnoreNextFrame = false;
      Log.info("stabilization frame ignored.");
      this.processV4L2NoMotion(score, false);
      return;
    }

    // Switching the light in a dark room changes fewer pixels strongly enough than
    // lightChangePixelRatio demands, although brightness and direction are
    // unambiguous. Only the decision to wake a monitor that is off uses the lower
    // ratio; brightness and direction stay mandatory so textured motion still wakes.
    if (
      !this.v4l2MonitorOn &&
      score > 0 &&
      score >= scoreThreshold &&
      Math.abs(averageBrightnessDelta) >= lightChangeThreshold &&
      changedPixelRatio >= wakeLightChangePixelRatio(config) &&
      dominantDirection >= lightChangeDirectionRatio
    ) {
      Log.info(`wake candidate ignored as global light change ${frameStats()}.`);
      this.v4l2PendingMotionScore = 0;
      this.v4l2IgnoreNextFrame = true;
      this.processV4L2NoMotion(score, false);
      return;
    }

    if (pendingMotionScore > 0) {
      // Slow auto exposure can take several frames before one of them is global
      // enough for the light filter, so no frame in between may release the wake.
      // The strongest score is kept, so a person who stops moving is not lost.
      this.v4l2PendingMotionScore = Math.max(pendingMotionScore, score);
      this.v4l2PendingWakeFrames--;
      if (this.v4l2PendingWakeFrames > 0) {
        this.processV4L2NoMotion(score);
        return;
      }
      score = this.v4l2PendingMotionScore;
      this.v4l2PendingMotionScore = 0;
      Log.info("held-back wake confirmed.");
    }

    // a score of zero means not a single pixel changed, which is never
    // motion, not even at a scoreThreshold of zero; matches the DiffCamEngine
    // semantics used by the browser backend
    const hasMotion = score > 0 && score >= scoreThreshold;

    if (
      hasMotion &&
      !this.v4l2MonitorOn &&
      pendingMotionScore === 0 &&
      changedPixelRatio >= wakeConfirmationPixelRatio(config)
    ) {
      this.v4l2PendingMotionScore = score;
      this.v4l2PendingWakeFrames = wakeConfirmationFrames(config);
      Log.info(`large wake candidate held back for confirmation ${frameStats()}.`);
      this.processV4L2NoMotion(score);
      return;
    }

    if (hasMotion) {
      this.v4l2LastMotionAt = Date.now();

      Log.info(`Motion detected, score: ${score}`);

      if (!this.v4l2MonitorOn) {
        this.v4l2MonitorOn = true;
        const request = this.v4l2MonitorRequest = (this.v4l2MonitorRequest || 0) + 1;

        this.activateMonitor()
          .then(() => Log.info("monitor has been activated."))
          .catch((error) => {
            if (this.v4l2MonitorRequest === request) {
              this.v4l2MonitorOn = false;
            }
            Log.error(
              `error activating monitor: ${describeError(error)}`
            );
          });
      }

      this.sendSocketNotification("V4L2_MOTION_STATUS", {
        score,
        hasMotion: true,
        monitorOn: this.v4l2MonitorOn
      });
      return;
    }

    this.processV4L2NoMotion(score);
  },

  processV4L2NoMotion (score, notify = true) {
    const config = this.v4l2Config;
    const timeout = toConfigNumber(config.timeout, 120000);

    if (
      config.autoHideOnNoMotion !== false &&
      timeout >= 0 &&
      Date.now() - this.v4l2LastMotionAt > timeout &&
      this.v4l2MonitorOn
    ) {
      this.v4l2MonitorOn = false;
      notify = true;
      const request = this.v4l2MonitorRequest = (this.v4l2MonitorRequest || 0) + 1;

      Log.info("deactivating monitor");

      this.deactivateMonitor()
        .then(() => Log.info("monitor has been deactivated."))
        .catch((error) => {
          if (this.v4l2MonitorRequest === request) {
            this.v4l2MonitorOn = true;
          }
          Log.error(
            `error deactivating monitor: ${describeError(error)}`
          );
        });
    }
    if (notify) {
      this.sendSocketNotification("V4L2_MOTION_STATUS", {
        score,
        hasMotion: false,
        monitorOn: this.v4l2MonitorOn
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
