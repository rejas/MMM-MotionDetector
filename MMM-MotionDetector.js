Module.register("MMM-MotionDetector",{

	defaults: {
		captureIntervalTime: 1000, // 1 second
		scoreThreshold: 20,
		timeout: 120000 // 2 minutes
	},

	lastScoreDetected: null,
	lastTimeMotionDetected: null,
	lastTimePoweredOff: null,
	poweredOff: false,
	poweredOffTime: 0,
	timeStarted: null,

	getHeader: function () {
		return "MMM-MotionDetector";
	},

	getScripts: function () {
		return [
			"moment.js",
			"diff-cam-engine.js"
		];
	},

	getTemplate: function () {
		return "MMM-MotionDetector.njk"
	},

	getTemplateData: function () {
		return {
			duration: moment.duration(this.poweredOffTime).humanize(),
			lastScoreDetected: this.lastScoreDetected,
			lastTimeMotionDetected: this.lastTimeMotionDetected.toLocaleTimeString(),
			percentagePoweredOff: (100 * this.poweredOffTime / (new Date() - this.timeStarted)).toFixed(2)
		}
	},

	// Override socket notification handler.
	socketNotificationReceived: function(notification, payload) {
		if (notification === "USER_PRESENCE") {
			this.sendNotification(notification, payload)
		}
	},

	start: function() {
		Log.info("MMM-MotionDetector: starting up");

		// TODO remove once https://github.com/MichMich/MagicMirror/pull/1599 is merged and released
		this.data.header = "MMM-MotionDetector";

		this.lastScoreDetected = 0;
		this.lastTimeMotionDetected = new Date();
		this.lastTimePoweredOff = new Date();
		this.timeStarted = new Date();

		// make sure that the monitor is on when starting
		this.sendSocketNotification("MOTION_DETECTED", {score: 0});

		let _this = this;
		let canvas = document.createElement("canvas");
		let video = document.createElement("video");
		let cameraPreview = document.createElement("div");
		cameraPreview.id = "cameraPreview";
		cameraPreview.style = "visibility:hidden;";
		cameraPreview.appendChild(video);

		DiffCamEngine.init({
			video: video,
			captureIntervalTime: _this.config.captureIntervalTime,
			motionCanvas: canvas,
			initSuccessCallback: function () {
				Log.info("MMM-MotionDetector: DiffCamEngine init successful");
				DiffCamEngine.start();
			},
			initErrorCallback: function (error) {
				Log.error("MMM-MotionDetector: DiffCamEngine init failed. " + error);
			},
			captureCallback: function(payload) {
				const score = payload.score;
				const currentDate = new Date();
				if (score > _this.config.scoreThreshold) {
					if (_this.poweredOff) {
						_this.poweredOffTime = _this.poweredOffTime + (currentDate.getTime() - _this.lastTimePoweredOff.getTime());
						_this.sendSocketNotification("MOTION_DETECTED", {score: score});
						_this.sendNotification("MOTION_DETECTED",  {score: score});
						_this.poweredOff = false;
					}
					_this.lastTimeMotionDetected = currentDate;
				}
				else {
					const time = currentDate.getTime() - _this.lastTimeMotionDetected.getTime();
					if ((time > _this.config.timeout) && (!_this.poweredOff)) {
						_this.sendSocketNotification("DEACTIVATE_MONITOR",  {timeSaved: _this.poweredOffTime});
						_this.sendNotification("DEACTIVATE_MONITOR",  {timeSaved: _this.poweredOffTime});
						_this.lastTimePoweredOff = currentDate;
						_this.poweredOff = true;
					}
				}
				_this.lastScoreDetected = score;
				_this.updateDom();
			}
		});
	}
});
