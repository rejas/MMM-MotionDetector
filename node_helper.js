'use strict';

/* Magic Mirror
 * Module: MMM-PIR-Sensor
 *
 * By Paul-Vincent Roll http://paulvincentroll.com
 * MIT Licensed.
 */

const NodeHelper = require('node_helper');
const exec = require('child_process').exec;

module.exports = NodeHelper.create({
  start: function () {
        this.started = false

        this.isMonitorOn(function(result){
            console.log("monitor on: " + result);
        });
  },

  activateMonitor: function () {
      var _this = this;
       this.isMonitorOn(function(result){
           if (!result){
               exec("/opt/vc/bin/tvservice --preferred && sudo chvt 6 && sudo chvt 7", null);
               console.log('monitor has been activated');
           }
               
        });
      this.started = false;
  },

  deactivateMonitor: function () {
      this.isMonitorOn(function(result){
           if (result){
                exec("/opt/vc/bin/tvservice -o", null);
                console.log('monitor has been deactivated');
           }
               
        });
      
      this.started = false;
  },

  isMonitorOn: function(resultCallback){
      //exec("/opt/vc/bin/tvservice -o", null);

      exec('/opt/vc/bin/tvservice -s', function(err, out, code) {
          var e = err;
          var o = out;
          var c = code;
         
            if (out.indexOf('0x120002') > 0) {
                resultCallback(false);
            }
            else {
                resultCallback(true);
            }

          console.log("monitor :" + out);
           
      });
  },
  // Subclass socketNotificationReceived received.
  socketNotificationReceived: function (notification, payload) {
      const self = this;
      if (notification === 'MOTION_DETECTED' && this.started == false) {
          const self = this;
          this.started = true;
          this.activateMonitor();
      }

      if (notification === 'DEACTIVATE_MONITOR' && this.started == false) {
          const self = this;
          this.started = true;
          this.deactivateMonitor();
      }
  }
  
});