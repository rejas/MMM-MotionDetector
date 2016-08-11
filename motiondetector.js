'use strict';

Module.register('motiondetector',{
	
	defaults: {
		powerSaving: true,
		timeout: 120000 // 5 mins
	},

	lastTimeMotionDetected: null,

	poweredOff: false,

    getScripts: function() {
		return ["motion.js", "imagecompare.js", "webcamcapture.js"];
	},
	
	// Override socket notification handler.
	socketNotificationReceived: function(notification, payload) {
		if (notification === "USER_PRESENCE"){
			this.sendNotification(notification, payload)
		}
	},
	
	start: function() {
		Log.info('Starting module: ' + this.name);

		this.lastTimeMotionDetected = new Date();

        var _this = this;

		_this.sendSocketNotification('MOTION_DETECTED', _this.config);

		
         var core = new MotionDetector.Core(function (detected) {
            if (detected) {
				_this.lastTimeMotionDetected = new Date();
				if (_this.poweredOff){
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
         });
	},


});