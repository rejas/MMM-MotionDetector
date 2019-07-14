# MMM-MotionDetector

## Installation

Just clone the module into your MagicMirror modules folder:

```
git clone https://github.com/rejas/MMM-MotionDetector.git
```

## Requirements

Accessing your (web)cam requires to have the client run on localhost or a HTTPS host (due to new requirements in Chrome for getUserMedia). The default value in your MagicMirror config.js is already `localhost` so most users shouldn't be affected.

Just in case you still have problems (like [here](https://github.com/rejas/MMM-MotionDetector/issues/6)) check your config and see if you can solve it by outcommenting the ip-address under

``` JavaScript
var config = {
    	address : '0.0.0.0',
	...
``` 

## Tested devices

So far I only used a [PlayStation3 Eye Webcam](https://en.wikipedia.org/wiki/PlayStation_Eye) for motion-detection at my MagicMirror. If you have successfully used this module with any other webcam, I'd be happy to hear about it.

If you want to use the wired PI-camera follow these steps provided by [@rev138](https://github.com/rejas/MMM-MotionDetector/issues/8#issuecomment-483356950):

    - Open /etc/modules-load.d/modules.conf
    - Add bcm2835-v4l2 to the end of the file and save it.
    - Reboot.
    - Profit

Another tutorial on how to enable the PI-camera in the browser can be found [in this blog post](https://reprage.com/post/pi-camera-module-in-the-browser).

## Using the module

To use this module, add it to the modules array in the `config/config.js` file:
````javascript
modules: [
	{
		module: "MMM-MotionDetector",
		position: "top_left",	// Optional. This can be any of the regions. Displays debug informations.
		config: {
			// The config property is optional.
			// See 'Configuration options' for more information.
		}
	}
]
````

## Configuration options

The following properties can be configured:

| Option                       | Description
| ---------------------------- | -----------
| `captureIntervalTime`        | Time in ms between capturing images for detection<br><br>**Default value:** `1000`|
| `scoreThreshold`             | Threshold minimum for an image to be considered significant<br><br>**Default value:** `20`|
| `timeout`                    | Time in ms after which monitor is turned off when no motion is detected<br><br>**Default value:** `120000`|

#### Default value:

````javascript
config: {
    captureIntervalTime: 1000,
    scoreThreshold: 20,
    timeout: 120000
}
````

## Notifications send

| Notification          | Payload       | Description
| --------------------- | ------------- | ------------
| `MOTION_DETECTED`     | score         | score calculated by the diff-cam-engine, 0 or greater |
| `DEACTIVATE_MONITOR`  | percentageOff | percentage of time the monitor was deactivated since the module started |


## Changelog

### [1.5.0] - 2019-07-14

- Show error on UI element when something goes wrong during initialization
- Cleaned up code
- Update dependencies

### [1.4.0] - 2019-03-08

- Updated code to getUserMedia from browser
- Cleaned up DOM template

### [1.3.0] - 2019-03-06

- Added time/percentage powered-off to DOM
- Switched to DOM templating

### [1.2.2] - 2019-03-06

- Switched to MM² codestyle
- Cleaned up code

### [1.2.1] - 2019-03-02

- Added eslint codestyles

### [1.2.0] - 2019-03-01

- Added DOM for displaying basic debug information on the MagicMirror when a position is specified
- Updated documentation

### [1.1.0] - 2018-11-01

- Switched from tvservice to vgcencmd. Module can now be used with vc4-kms-v3d and vc4-fkms-v3d drivers.

### [1.0.0] - 2018-07-20

- Initial release

## Acknowledgements

Many thanks to 
- [alexyak](https://github.com/alexyak/motiondetector) for the original module code
- [lonekorean](https://github.com/lonekorean/diff-cam-engine/) for the diffcam engine code.
