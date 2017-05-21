# motiondetector

## Installation

Just clone the module into your MagicMirror modules folder:

```
git clone https://github.com/alexyak/motiondetector.git
```


## Configuration

|Option|Description|
|---|---|
|`captureIntervalTime`|Time in ms between capturing images for detection<br>**Type:** `integer`|
|`scoreThreshold`|Threshold minimum for an image to be considered significant<br>**Type:** `integer`|
|`timeout`|Time in ms after which monitor is turned off when no motion is detected<br>**Type:** `integer`|

Example for the `config.js`:

``` JavaScript
{
        module: 'motiondetector',
        config: {
                captureIntervalTime: 5000,
                scoreThreshold: 200,
                timeout: 60000
        }
}
```
