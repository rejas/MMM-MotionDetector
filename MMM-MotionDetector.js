/* eslint-disable indent */
/* global DiffCamEngine */
Module.register("MMM-MotionDetector", {
  defaults: {
    captureIntervalTime: 1000, // 1 second
    scoreThreshold: 20,
    timeout: 120000, // 2 minutes
    controlDisplay: true, // switch the monitor on/off
		additionalNotification: false, // set to some other value to specify an additional notification sent to all modules
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
    Log.debug("Notification received: " + notification);
    if (notification === "USER_PRESENCE") {
      this.sendNotification(notification, payload);
    }
  },

  start: function () {
    Log.info(this.name + ": starting up");

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
      captureIntervalTime: this.config.captureIntervalTime,
      motionCanvas: canvas,

      initSuccessCallback: () => {
        Log.info("MMM-MotionDetector: DiffCamEngine init successful.");
        
        Log.debug("Timeout set to " + this.config.timeout + " milliseconds.");
        Log.debug("Motion threshold set to " + this.config.scoreThreshold);
        Log.debug("Will MotionDetector control the monitor? " + this.config.controlDisplay);
        if (this.config.additionalNotification) { Log.debug("Will send additional notification: " + this.config.additionalNotification); }
      
        DiffCamEngine.start();
      },
      initErrorCallback: (error) => {
        Log.error("MMM-MotionDetector: DiffCamEngine init failed: " + error);
        this.error = error;
        this.updateDom();
      },

      captureCallback: (payload) => {
        const score = payload.score;
        const currentDate = new Date();
        this.percentagePoweredOff = ((100 * this.poweredOffTime) / (currentDate.getTime() - this.timeStarted)).toFixed(2);
        const time = currentDate.getTime() - this.lastTimeMotionDetected.getTime();

        if (score > this.config.scoreThreshold) { // We have found motion
          Log.info("MMM-MotionDetector: Motion detected, score " + score);
          this.sendSocketNotification("MOTION_DETECTED", { score: score });

          if (this.poweredOff) {
            this.poweredOffTime = this.poweredOffTime + (currentDate.getTime() - this.lastTimePoweredOff.getTime());
            this.sendNotification("MOTION_DETECTED", { score: score });

            // if configured for additional notification, send it out
						if (this.config.additionalNotification) {
							Log.debug("Additional notification outbound: " + this.config.additionalNotification);
							this.sendNotification(this.config.additionalNotification, "");
            }

            this.sendSocketNotification("ACTIVATE_MONITOR");
            this.poweredOff = false;
          }
          this.lastTimeMotionDetected = currentDate;

        } else {
          if (this.config.timeout >= 0 && time > this.config.timeout && !this.poweredOff) {
            if (this.config.controlDisplay) {
              Log.debug("Deactivating monitor.");
              this.sendSocketNotification("DEACTIVATE_MONITOR");
            }
            this.lastTimePoweredOff = currentDate;
            this.poweredOff = true;
          }
        }
        this.lastScoreDetected = score;
        this.updateDom();
      },
    });
  },
});
