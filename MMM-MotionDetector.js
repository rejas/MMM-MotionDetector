/* global DiffCamEngine */
Module.register("MMM-MotionDetector", {
  defaults: {
    captureIntervalTime: 1000, // 1 second
    scoreThreshold: 20,
    timeout: 120000, // 2 minutes,
    deviceId: null,
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
      lastTimeMotionDetected: this.lastTimeMotionDetected.toLocaleTimeString(),
      percentagePoweredOff: this.percentagePoweredOff,
      timeout: this.config.timeout,
      error: this.error,
    };
  },

  // Override socket notification handler.
  socketNotificationReceived: function (notification, payload) {
    if (notification === "USER_PRESENCE") {
      this.sendNotification(notification, payload);
    }
  },

  start: function () {
    Log.info("MMM-MotionDetector: starting up");

    this.data.header = "MMM-MotionDetector";
    this.lastScoreDetected = 0;
    this.lastTimeMotionDetected = new Date();
    this.lastTimePoweredOff = new Date();
    this.timeStarted = new Date().getTime();

    // make sure that the monitor is on when starting
    this.sendSocketNotification("ACTIVATE_MONITOR");

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
        Log.info("MMM-MotionDetector: DiffCamEngine init successful.");
        DiffCamEngine.start();
      },
      initErrorCallback: (error) => {
        Log.error("MMM-MotionDetector: DiffCamEngine init failed: " + error);
        this.error = error;
        this.updateDom();
      },
      captureCallback: ({ score, hasMotion }) => {
        const currentDate = new Date();
        this.percentagePoweredOff = ((100 * this.poweredOffTime) / (currentDate.getTime() - this.timeStarted)).toFixed(
          2
        );
        if (hasMotion) {
          Log.info("MMM-MotionDetector: Motion detected, score " + score);
          this.sendSocketNotification("MOTION_DETECTED", { score: score });
          this.sendNotification("MOTION_DETECTED", { score: score });
          if (this.poweredOff) {
            this.sendSocketNotification("ACTIVATE_MONITOR");
            this.poweredOffTime = this.poweredOffTime + (currentDate.getTime() - this.lastTimePoweredOff.getTime());
            this.poweredOff = false;
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
