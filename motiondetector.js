'use strict';

Module.register('motiondetector',{
	
	defaults: {
		powerSaving: true,
		timeout: 120000 // 5 mins
	},

	lastTimeMotionDetected: null,

	poweredOff: false,

    getScripts: function() {		
		return ["diff-cam-engine.js"];
	},
	
	// Override socket notification handler.
	socketNotificationReceived: function(notification, payload) {
		if (notification === "USER_PRESENCE"){
			this.sendNotification(notification, payload)
		}
	},
	

	notificationReceived: function (notification, payload, sender) {

		var _this = self;

		// if (notification === "DOM_OBJECTS_CREATED") {
		// 	var video = document.createElement('video');
		// 	var cameraPreview = document.createElement("div");
		// 	cameraPreview.id = "cameraPreview";
		// 	cameraPreview.style = "visibility:hidden;"
		// 	cameraPreview.appendChild(video);

		// 	var canvas = document.createElement('canvas');

		// 	DiffCamEngine.init({
		// 		video: video,
		// 		motionCanvas: canvas,
		// 		initSuccessCallback: function () {
		// 			DiffCamEngine.start();
		// 		},
		// 		initErrorCallback: function () {
		// 			console.log('error init cam engine');
		// 		},
		// 		captureCallback: _this.onCapture
		// 	});
		// }
	},

	onCapture: function (payload) {
		var _this = this;
		var score = payload.score;
		if (score > 20) {
			_this.lastTimeMotionDetected = new Date();
			if (_this.poweredOff) {
				_this.poweredOff = false;
				_this.sendSocketNotification('MOTION_DETECTED', _this.config);
			}
		}
		else {
			var currentDate = new Date();
			var time = currentDate.getTime() - _this.lastTimeMotionDetected;
			if ((time > _this.config.timeout) && (!_this.poweredOff)) {
				_this.sendSocketNotification('DEACTIVATE_MONITOR', _this.config);
				_this.sendNotification('DEACTIVATE_MONITOR', _this.config);
				_this.poweredOff = true;
			}
		}
		console.log('score:' + score);
	},

	start: function() {
		Log.info('Starting module: ' + this.name);

		this.lastTimeMotionDetected = new Date();

        var _this = this;

		 // make sure that the monitor is on when starting
		_this.sendSocketNotification('MOTION_DETECTED', _this.config);
		
	
			var video = document.createElement('video');
			var cameraPreview = document.createElement("div");
			cameraPreview.id = "cameraPreview";
			cameraPreview.style = "visibility:hidden;"
			cameraPreview.appendChild(video);

			var canvas = document.createElement('canvas');

			DiffCamEngine.init({
				video: video,
				motionCanvas: canvas,
				initSuccessCallback: function () {
					DiffCamEngine.start();
				},
				initErrorCallback: function () {
					console.log('error init cam engine');
				},
				captureCallback: function(payload){				
					var score = payload.score;
					if (score > 20) {
						_this.lastTimeMotionDetected = new Date();
						if (_this.poweredOff) {
							_this.poweredOff = false;
							_this.sendSocketNotification('MOTION_DETECTED', _this.config);
						}
					}
					else {
						var currentDate = new Date();
						var time = currentDate.getTime() - _this.lastTimeMotionDetected;
						if ((time > _this.config.timeout) && (!_this.poweredOff)) {
							_this.sendSocketNotification('DEACTIVATE_MONITOR', _this.config);
							_this.sendNotification('DEACTIVATE_MONITOR', _this.config);
							_this.poweredOff = true;
						}
					}
					console.log('score:' + score);
				}
			});
     		        
	},


});