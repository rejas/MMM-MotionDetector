# Module: motiondetector
The `motiondetector` module is a <a href="https://github.com/MichMich/MagicMirror">MagicMirror</a> addon.
This module detects any motion via the camera connected to your Raspberry Pi and will switch on / off the display depending on the configured timeout.

## Requirements
Camera connected to Raspberry Pi

## Using the module

To use this module, add it to the modules array in the `config/config.js` file:
````javascript
modules: [
	{
		module: 'motiondetector',
		config: {
			timeout: 120000 // time in milliseconds for to switch off the display after last movement is detected.
		}
	}
]
````
