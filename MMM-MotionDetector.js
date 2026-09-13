/* global DiffCamEngine, Log, Module, moment */
Module.register("MMM-MotionDetector", {
  defaults: {
    cameraBackend: "browser",
    captureIntervalTime: 1000, // 1 second
    platform: "x11",
    scoreThreshold: 20,
    timeout: 120000, // 2 minutes,
    deviceId: null,

    cameraDevice: "/dev/video0",
    pixelDiffThreshold: 30,
    lightChangeThreshold: 12,
    lightChangePixelRatio: 0.55,
    lightChangeDirectionRatio: 0.80,
    autoHideOnNoMotion: true,
    wakeConfirmationPixelRatio: 0.25,
    wakeConfirmationFrames: 3,
  },

  lastScoreDetected: null,
  lastTimeMotionDetected: null,
  lastTimePoweredOff: null,
  percentagePoweredOff: 0,
  poweredOff: false,
  poweredOffTime: 0,
  timeStarted: null,
  error: null,

  getHeader: function () {
    return "MMM-MotionDetector";
  },

  getScripts: function () {
    return ["moment.js", "diff-cam-engine.js"];
  },

  getTemplate: function () {
    return "MMM-MotionDetector.njk";
  },

  getTemplateData: function () {
    return {
      duration: moment.duration(this.poweredOffTime).humanize(),
      lastScoreDetected: this.lastScoreDetected,
      lastTimeMotionDetected: this.lastTimeMotionDetected ? this.lastTimeMotionDetected.toLocaleTimeString() : null,
      percentagePoweredOff: this.percentagePoweredOff,
      timeout: this.config.timeout,
      error: this.error,
    };
  },

  /**
   * Compute the running total (and percentage) of time the monitor has spent
   * powered off, folding in the stretch that is currently in progress. Shared
   * between the browser and V4L2 backends so both report identical figures.
   * @param currentDate reference time for "now"
   * @returns {{poweredOffSoFar: number, percentage: string}}
   */
  computePercentagePoweredOff: function (currentDate) {
    const ongoingPoweredOffTime = this.poweredOff
      ? Math.max(0, currentDate.getTime() - this.lastTimePoweredOff.getTime())
      : 0;
    const poweredOffSoFar = this.poweredOffTime + ongoingPoweredOffTime;
    const elapsed = currentDate.getTime() - this.timeStarted;

    return {
      poweredOffSoFar: poweredOffSoFar,
      percentage: elapsed > 0 ? ((100 * poweredOffSoFar) / elapsed).toFixed(2) : "0.00",
    };
  },

  socketNotificationReceived: function (notification, payload) {
    if (this.config.cameraBackend !== "v4l2") {
      return;
    }

    if (notification === "V4L2_CAMERA_STARTED") {
      Log.info("V4L2 camera started: " + payload.device);
      this.error = null;

      if (this.data.position) {
        this.updateDom();
      }

      return;
    }

    if (notification === "V4L2_CAMERA_ERROR") {
      this.error = payload.error;
      Log.error("V4L2 camera failed: " + payload.error);

      if (this.data.position) {
        this.updateDom();
      }

      return;
    }

    if (notification === "V4L2_MOTION_STATUS") {
      const currentDate = new Date();

      this.lastScoreDetected = payload.score;

      const { poweredOffSoFar, percentage } = this.computePercentagePoweredOff(currentDate);
      this.percentagePoweredOff = percentage;

      if (payload.hasMotion) {
        this.lastTimeMotionDetected = currentDate;

        this.sendNotification("MOTION_DETECTED", {
          score: payload.score
        });
      }

      if (payload.monitorOn === false && !this.poweredOff) {
        this.lastTimePoweredOff = currentDate;
        this.poweredOff = true;
      }

      if (payload.monitorOn === true && this.poweredOff) {
        this.poweredOffTime = poweredOffSoFar;
        this.poweredOff = false;
      }

      if (this.data.position) {
        this.updateDom();
      }
    }
  },

  start: function () {
    Log.info("starting up for platform " + this.config.platform + ".");

    this.data.header = "MMM-MotionDetector";
    this.lastScoreDetected = 0;
    this.lastTimeMotionDetected = new Date();
    this.lastTimePoweredOff = new Date();
    this.timeStarted = new Date().getTime();

    this.sendSocketNotification("INIT_MONITOR", this.config.platform);

    if (this.config.cameraBackend === "v4l2") {
      Log.info("starting V4L2 motion backend.");
      this.sendSocketNotification("INIT_V4L2", this.config);
      return;
    }

    const canvas = document.createElement("canvas");
    const video = document.createElement("video");
    const cameraPreview = document.createElement("div");
    cameraPreview.id = "cameraPreview";
    cameraPreview.style = "visibility:hidden;";
    cameraPreview.appendChild(video);

    DiffCamEngine.init({
      video: video,
      deviceId: this.config.deviceId,
      captureIntervalTime: this.config.captureIntervalTime,
      motionCanvas: canvas,
      scoreThreshold: this.config.scoreThreshold,
      initSuccessCallback: () => {
        Log.info("DiffCamEngine init successful.");
        DiffCamEngine.start();
      },
      initErrorCallback: (error) => {
        Log.error(`DiffCamEngine init failed: ${error}`);
        this.error = error;
        this.updateDom();
      },
      captureCallback: ({ score, hasMotion }) => {
        const currentDate = new Date();

        const { poweredOffSoFar, percentage } = this.computePercentagePoweredOff(currentDate);
        this.percentagePoweredOff = percentage;

        if (hasMotion) {
          Log.info(`Motion detected, score: ${score}`);
          this.sendNotification("MOTION_DETECTED", { score: score });
          if (this.poweredOff) {
            this.poweredOffTime = poweredOffSoFar;
            this.poweredOff = false;
            Log.info(`Percentage of uptime powered off:  ${this.percentagePoweredOff}`);
            this.sendSocketNotification("ACTIVATE_MONITOR");
          }
          this.lastTimeMotionDetected = currentDate;
        } else {
          const time = currentDate.getTime() - this.lastTimeMotionDetected.getTime();
          if (this.config.timeout >= 0 && time > this.config.timeout && !this.poweredOff) {
            this.sendSocketNotification("DEACTIVATE_MONITOR");
            this.lastTimePoweredOff = currentDate;
            this.poweredOff = true;
          }
        }
        this.lastScoreDetected = score;

        if (this.data.position) this.updateDom();
      },
    });
  },
});
