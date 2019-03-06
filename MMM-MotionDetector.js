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

	getDom: function () {
		let wrapper = document.createElement("div");
		let headline = document.createElement("h3");
		headline.innerHTML = "MMM-MotionDetector";
		wrapper.appendChild(headline);
		let saved = document.createElement("p");
		saved.innerHTML = "time spend powered off: " + this.poweredOffTime;
		wrapper.appendChild(saved);
		let score = document.createElement("p");
		score.innerHTML = "last score detected: " + this.lastScoreDetected;
		wrapper.appendChild(score);
		let time = document.createElement("p");
		time.innerHTML = "last time motion detected: " + this.lastTimeMotionDetected.toLocaleTimeString();
		wrapper.appendChild(time);
		return wrapper;
	},

	getScripts: function() {
		return ["diff-cam-engine.js"];
	},

	// Override socket notification handler.
	socketNotificationReceived: function(notification, payload) {
		if (notification === "USER_PRESENCE") {
			this.sendNotification(notification, payload)
		}
	},

	start: function() {
		Log.info("MMM-MotionDetector: starting up");

		this.lastScoreDetected = 0;
		this.lastTimeMotionDetected = new Date();
		this.lastTimePoweredOff = new Date();

		// make sure that the monitor is on when starting
		this.sendSocketNotification("MOTION_DETECTED", 0);

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
				Log.error("MMM-MotionDetector: DiffCamEngine init failed, error:");
				Log.error(error);
			},
			captureCallback: function(payload) {
				const score = payload.score;
				const currentDate = new Date();
				if (score > _this.config.scoreThreshold) {
					if (_this.poweredOff) {
						_this.poweredOffTime += (currentDate.getTime() - _this.lastTimePoweredOff);
						_this.sendSocketNotification("MOTION_DETECTED", score);
						_this.poweredOff = false;
					}
					_this.lastTimeMotionDetected = current;
				}
				else {
					const time = currentDate.getTime() - _this.lastTimeMotionDetected;
					if ((time > _this.config.timeout) && (!_this.poweredOff)) {
						_this.sendSocketNotification("DEACTIVATE_MONITOR", _this.config);
						_this.sendNotification("DEACTIVATE_MONITOR", _this.config);
						_this.lastTimePoweredOff = currentDate.getTime();
						_this.poweredOff = true;
					}
				}
				_this.lastScoreDetected = score;
				_this.updateDom();
				Log.info("MMM-MotionDetector: score " + score);
			}
		});
	}
});
