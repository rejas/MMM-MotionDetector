'use strict';
const NodeHelper = require('node_helper');
const exec = require('child_process').exec;

module.exports = NodeHelper.create({
    start: function () {
        this.started = false;
        this.isMonitorOn(function(result) {
            console.log('MMM-MotionDetector: monitor on ' + result);
        });
    },

    activateMonitor: function () {
        this.isMonitorOn(function(result) {
            if (!result) {
                exec('/opt/vc/bin/tvservice --preferred && sudo chvt 6 && sudo chvt 7', null);
                console.log('MMM-MotionDetector: monitor has been activated');
            }
        });
        this.started = false;
    },

    deactivateMonitor: function () {
        this.isMonitorOn(function(result) {
            if (result) {
                exec('/opt/vc/bin/tvservice -o', null);
                console.log('MMM-MotionDetector: monitor has been deactivated');
            }
        });
        this.started = false;
    },

    isMonitorOn: function(resultCallback) {
        exec('/opt/vc/bin/tvservice -s', function(err, out, code) {
            if (out.indexOf('0x120002') > 0) {
                resultCallback(false);
            }
            else {
                resultCallback(true);
            }
            console.log('MMM-MotionDetector: monitor ' + out);
        });
    },

    // Subclass socketNotificationReceived received.
    socketNotificationReceived: function (notification, payload) {
        if (notification === 'MOTION_DETECTED' && this.started === false) {
            console.log('MMM-MotionDetector: MOTION_DETECTED');
            this.started = true;
            this.activateMonitor();
        }
        if (notification === 'DEACTIVATE_MONITOR' && this.started === false) {
            console.log('MMM-MotionDetector: DEACTIVATE_MONITOR');
            this.started = true;
            this.deactivateMonitor();
        }
    }
});
