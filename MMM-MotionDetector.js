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
        return ['diff-cam-engine.js'];
    },

    // Override socket notification handler.
    socketNotificationReceived: function(notification, payload) {
        if (notification === 'USER_PRESENCE') {
            this.sendNotification(notification, payload)
        }
    },

    start: function() {
        Log.info('MMM-MotionDetector: starting up');

        this.lastTimeMotionDetected = new Date();

        // make sure that the monitor is on when starting
        this.sendSocketNotification('MOTION_DETECTED', this.config);

        let _this = this;
        let canvas = document.createElement('canvas');
        let video = document.createElement('video');
        let cameraPreview = document.createElement('div');
        cameraPreview.id = 'cameraPreview';
        cameraPreview.style = 'visibility:hidden;';
        cameraPreview.appendChild(video);

        DiffCamEngine.init({
            video: video,
            captureIntervalTime: _this.config.captureIntervalTime,
            motionCanvas: canvas,
            initSuccessCallback: function () {
                DiffCamEngine.start();
            },
            initErrorCallback: function () {
                const warning = 'MMM-MotionDetector: error init cam engine';
                Log.warn(warning);
                console.log(warning);
            },
            captureCallback: function(payload) {
                const score = payload.score;
                if (score > _this.config.scoreThreshold) {
                    _this.lastTimeMotionDetected = new Date();
                    if (_this.poweredOff) {
                        _this.poweredOff = false;
                        _this.sendSocketNotification('MOTION_DETECTED', _this.config);
                    }
                }
                else {
                    const currentDate = new Date(),
                        time = currentDate.getTime() - _this.lastTimeMotionDetected;
                    if ((time > _this.config.timeout) && (!_this.poweredOff)) {
                        _this.sendSocketNotification('DEACTIVATE_MONITOR', _this.config);
                        _this.sendNotification('DEACTIVATE_MONITOR', _this.config);
                        _this.poweredOff = true;
                    }
                }
                const info = 'MMM-MotionDetector: score ' + score;
                Log.info(warning);
                console.info(warning);
            }
        });
    }
});
