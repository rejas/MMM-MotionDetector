# MMM-MotionDetector

## Installation

Just clone the module into your MagicMirror modules folder:

```
git clone https://github.com/rejas/MMM-MotionDetector.git
```

## Requirements

Accessing your (web)cam requires to have the client run on localhost or a HTTPS host (due to new requirements in Chrome for getUserMedia). The default value in your MagicMirror config.js is already `localhost` so most users shouldn't be affected.

## Configuration

|Option|Description|
|---|---|
|`captureIntervalTime`|Time in ms between capturing images for detection<br>**Type:** `integer`|
|`scoreThreshold`|Threshold minimum for an image to be considered significant<br>**Type:** `integer`|
|`timeout`|Time in ms after which monitor is turned off when no motion is detected<br>**Type:** `integer`|

Example for the `config.js`:

``` JavaScript
{
        module: 'MMM-MotionDetector',
        config: {
                captureIntervalTime: 5000,
                scoreThreshold: 200,
                timeout: 60000
        }
}
```

## Changelog

### [1.1.0] - 2018-11-01

- Switch from tvservice to vgcencmd. Module can now be used with vc4-kms-v3d and vc4-fkms-v3d drivers.

### [1.0.0] - 2018-07-20

- Initial release
