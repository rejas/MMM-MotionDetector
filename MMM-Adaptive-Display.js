Module.register("MMM-Adaptive-Display", {

	defaults: {
		captureIntervalTime: 1000, // 1 second
		scoreThreshold: 20,
		timeout: 120000 // 2 minutes
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
		return "MMM-Adaptive-Display";
	},

	getScripts: function () {
		return [
			"moment.js",
			"diff-cam-engine.js"
		];
	},

	getTemplate: function () {
		return "MMM-Adaptive-Display.njk";
	},

	getTemplateData: function () {
		return {
			duration: moment.duration(this.poweredOffTime).humanize(),
			lastScoreDetected: this.lastScoreDetected,
			lastTimeMotionDetected: this.lastTimeMotionDetected.toLocaleTimeString(),
			percentagePoweredOff: this.percentagePoweredOff,
			error: this.error
		};
	},

	// Override socket notification handler.
	socketNotificationReceived: function (notification, payload) {
		if (notification === "USER_PRESENCE") {
			this.sendNotification(notification, payload);
		}
	},

	start: function () {
		Log.info("MMM-Adaptive-Display: starting up");

		this.data.header = "MMM-Adaptive-Display";
		this.lastScoreDetected = 0;
		this.lastTimeMotionDetected = new Date();
		this.lastTimePoweredOff = new Date();
		this.timeStarted = new Date().getTime();

		// make sure that the monitor is on when starting
		this.sendSocketNotification("MOTION_DETECTED", {score: 0});

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
				Log.info("MMM-Adaptive-Display: DiffCamEngine init successful");
				DiffCamEngine.start();
			},
			initErrorCallback: (error) => {
				Log.error("MMM-Adaptive-Display: DiffCamEngine init failed. " + error);
				this.error = error;
				this.updateDom();
			},
			captureCallback: (payload) => {
				const score = payload.score;
				const currentDate = new Date();
				this.percentagePoweredOff = (100 * this.poweredOffTime / (currentDate.getTime() - this.timeStarted)).toFixed(2);
				if (score > this.config.scoreThreshold) {
					if (this.poweredOff) {
						this.poweredOffTime = this.poweredOffTime + (currentDate.getTime() - this.lastTimePoweredOff.getTime());
						this.sendSocketNotification("MOTION_DETECTED", {score: score});
						this.sendNotification("MOTION_DETECTED", {score: score});
						this.poweredOff = false;
					}
					this.lastTimeMotionDetected = currentDate;
				} else {
					const time = currentDate.getTime() - this.lastTimeMotionDetected.getTime();
					if ((time > this.config.timeout) && (!this.poweredOff)) {
						this.sendSocketNotification("DEACTIVATE_MONITOR", {percentageOff: this.percentagePoweredOff});
						this.sendNotification("DEACTIVATE_MONITOR", {percentageOff: this.percentagePoweredOff});
						this.lastTimePoweredOff = currentDate;
						this.poweredOff = true;
					}
				}
				this.lastScoreDetected = score;
				this.updateDom();
			}
		});
	}
});
