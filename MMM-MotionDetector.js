/* global DiffCamEngine, Log, Module */
'use strict';

Module.register('MMM-MotionDetector',{

    defaults: {
        captureIntervalTime: 1000, // 1 second
        scoreThreshold: 20,
        timeout: 120000 // 2 minutes
    },

    lastScore: 0,

    lastTimeMotionDetected: new Date(),

    poweredOff: false,

    getDom: function () {
        let wrapper = document.createElement("div");
        let headline = document.createElement("h3");
        headline.innerHTML = "MMM-Motion";
        wrapper.appendChild(headline);
        let score = document.createElement("p");
        score.innerHTML = "last score: " + this.lastScore;
        wrapper.appendChild(score);
        let time = document.createElement("p");
        time.innerHTML = "last time: " + this.lastTimeMotionDetected.toLocaleTimeString();
        wrapper.appendChild(time);
        return wrapper;
    },

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
        this.sendSocketNotification('MOTION_DETECTED', { score: 'initial'});

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
                _this.sendNotification("SHOW_ALERT", {type: "notification", message: "started"});
                DiffCamEngine.start();
            },
            initErrorCallback: function (err) {
                _this.sendNotification("SHOW_ALERT", {type: "notification", message: err.message});
                Log.error('MMM-MotionDetector: error init cam engine');
            },
            captureCallback: function(payload) {
                const score = payload.score;
                _this.lastScore = score;
                if (score > _this.config.scoreThreshold) {
                    _this.lastTimeMotionDetected = new Date();
                    if (_this.poweredOff) {
                        _this.poweredOff = false;
                        _this.sendSocketNotification('MOTION_DETECTED', payload);
                    }
                    _this.updateDom();
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
                Log.info('MMM-MotionDetector: score ' + score);
            }
        });
    }
});
