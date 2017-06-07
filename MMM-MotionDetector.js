'use strict';

Module.register('MMM-MotionDetector',{

    defaults: {
        captureIntervalTime: 1000, // 1 second
        scoreThreshold: 20,
        timeout: 120000 // 2 minutes
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

    start: function() {
        Log.info('Starting module: ' + this.name);

        this.lastTimeMotionDetected = new Date();

        // make sure that the monitor is on when starting
        this.sendSocketNotification('MOTION_DETECTED', this.config);

        var _this = this;
        var canvas = document.createElement('canvas');
        var video = document.createElement('video');
        var cameraPreview = document.createElement("div");
        cameraPreview.id = "cameraPreview";
        cameraPreview.style = "visibility:hidden;";
        cameraPreview.appendChild(video);

        DiffCamEngine.init({
            video: video,
            captureIntervalTime: _this.config.captureIntervalTime,
            motionCanvas: canvas,
            initSuccessCallback: function () {
                DiffCamEngine.start();
            },
            initErrorCallback: function () {
                console.log('error init cam engine');
            },
            captureCallback: function(payload){
                var score = payload.score;
                if (score > _this.config.scoreThreshold) {
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
    }
});
