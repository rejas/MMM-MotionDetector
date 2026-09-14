# MMM-MotionDetector

## Installation

Just clone the module into your MagicMirror modules folder.

Assuming you are in your MagicMirror directory execute these commands:

```shell
cd modules
git clone https://github.com/rejas/MMM-MotionDetector.git
```

## Requirements

Accessing your (web)cam requires to have the client run on localhost or a HTTPS host (due to new requirements in Chrome for getUserMedia).
The default value in your MagicMirror config.js is already `localhost` so most users shouldn't be affected.

Just in case you still have problems (like [here](https://github.com/rejas/MMM-MotionDetector/issues/6)), check your config
and make sure the address is **not** set to `0.0.0.0`:

```javascript
let config = {
  address: "localhost", // 0.0.0.0 will stop the browser from granting camera access
  ...
```

Chromium and Electron only offer the camera permission on `localhost` and `127.0.0.1`, so serving the mirror on
`0.0.0.0` leaves the permission greyed out. If another module forces you to use `0.0.0.0`, see
[the reverse proxy workaround](#configuring-motiondetector-with-another-module-that-requires-magicmirror-address-to-be-0000) below.

### Raspberry Pi OS

MMM-MotionDetector supports two camera backends:

- `browser` - the original Electron/Chromium `getUserMedia()` backend
- `v4l2` - a server-side backend using a Linux V4L2 device and `ffmpeg`

The `browser` backend remains the default and keeps the original behavior.

The `v4l2` backend can be useful on Raspberry Pi systems where the camera is available
as `/dev/video*` but is not exposed to Electron as a browser video input.

Example:

    config: {
      cameraBackend: "v4l2",
      cameraDevice: "/dev/video0"
    }

Requirements for the V4L2 backend:

- `ffmpeg` must be installed
- the camera must be available as a V4L2 device such as `/dev/video0`
- the user running MagicMirror must have permission to access the device

Available V4L2 devices can be listed with:

    v4l2-ctl --list-devices

The V4L2 backend does not require Electron camera access. How the `/dev/video*`
device is provided depends on the Raspberry Pi OS and camera stack in use.

## Configuration

To use this module, add it to the modules array in the `config/config.js` file:

```javascript
modules: [
  {
    module: "MMM-MotionDetector",
    position: "top_left", // Optional. This can be any of the regions. Displays debug information.
    config: {
      // The config property is optional.
      // See 'Configuration options' for more information.
    }
  }
];
```

### Configuration options

The following properties can be configured:

| Option                       | Description                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                          | Default value |
| ---------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ------------- |
| `cameraBackend`              | Camera backend to use. `browser` keeps the original Electron/Chromium camera handling. `v4l2` reads a Linux video device server-side using `ffmpeg`.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                 | `browser`     |
| `cameraDevice`               | V4L2 device used by the `v4l2` backend.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                              | `/dev/video0` |
| `captureIntervalTime`        | Time in ms between capturing images for detection.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                   | `1000`        |
| `deviceId`                   | Browser/Electron camera device ID used by the `browser` backend.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                     |               |
| `platform`                   | On what platforms this runs.<br><br>**Possible values:** `cec`, `labwc`, `mac-arm`, `mac-intel`, `x11`                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                               | `x11`         |
| `scoreThreshold`             | Minimum number of changed pixels required for motion detection.<br><br>Set to `0` to treat any movement as motion.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                   | `20`          |
| `pixelDiffThreshold`         | Minimum brightness difference for a pixel to count as changed in the V4L2 backend.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                   | `30`          |
| `lightChangeThreshold`       | Minimum average brightness change used to detect sudden global lighting changes in the V4L2 backend.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                 | `12`          |
| `lightChangePixelRatio`      | Minimum ratio of changed pixels required for a global light-change event.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                            | `0.55`        |
| `lightChangeDirectionRatio`  | Minimum ratio of changed pixels moving in the same brightness direction for a light-change event.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                    | `0.80`        |
| `timeout`                    | Time in ms after which the monitor is turned off when no motion is detected.<br><br>Set to `-1` to never turn off the monitor.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                       | `120000`      |
| `autoHideOnNoMotion`         | Whether the V4L2 backend automatically turns the monitor off once `timeout` elapses without motion. Set to `false` to keep the monitor on regardless of motion.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                      | `true`        |
| `wakeConfirmationPixelRatio` | V4L2 only. While the monitor is off, a motion candidate changing at least this ratio of the image (`0`-`1`) is held back instead of waking immediately, because it may be an early auto exposure step of a global light change. `0` confirms every wake. Invalid values fall back to the default.                                                                                                                                                                                                                                                                                                                                                                                                                                    | `0.25`        |
| `wakeConfirmationFrames`     | V4L2 only. Number of complete frames observed after such a held-back candidate. If the light filter recognizes a global light change within these frames the wake is discarded, otherwise the monitor wakes on the last of them. Higher values tolerate slower auto exposure, but delay waking for large real motion by up to this many capture intervals (default: about 3 seconds at `captureIntervalTime: 1000`). Small motion below `wakeConfirmationPixelRatio` is never delayed. Integer, at least `1`; `1` confirms with a single frame.                                                                                                                                                                                      | `3`           |
| `wakeLightChangePixelRatio`  | V4L2 only. Minimum ratio of changed pixels for classifying a wake candidate as a global light change while the monitor is off. The candidate is ignored when this ratio is reached and, as in the regular filter, the average brightness change reaches `lightChangeThreshold` and the changed pixels move in one direction by at least `lightChangeDirectionRatio`; the following frame is then skipped as stabilization. It is lower than `lightChangePixelRatio` because in a dark room switching the light on or off changes fewer pixels strongly enough. It never applies while the monitor is on, where `lightChangePixelRatio` keeps controlling the regular light filter. `0`-`1`; invalid values fall back to the default. | `0.30`        |

The wake options only matter for the `v4l2` backend, when turning the room light on or off would otherwise wake the monitor. `wakeLightChangePixelRatio` recognizes a clear light change in a single frame, `wakeConfirmationFrames` covers exposure adjustments spread over several frames. While the monitor is off, a large object that brightens or darkens at least `wakeLightChangePixelRatio` of the image uniformly is treated like a light change as well, so a person entering a dark room may only wake the monitor once further movement follows. The defaults are general starting points, not values tuned for a specific camera.

#### How to get the deviceId

You need to retrieve the deviceId from the browser / electron instance you are running this module on.

- If you are running it in a browser, use this command in the web console `navigator.mediaDevices.enumerateDevices()` to get all devices.
- In the standard MM Electron, add 'export ELECTRON_ENABLE_LOGGING=true' to the mm.sh. Then cat the pm2 error logs and look for the DeviceID.

### Tested devices

So far I only used a [PlayStation3 Eye Webcam](https://en.wikipedia.org/wiki/PlayStation_Eye) for motion-detection at my MagicMirror.
If you have successfully used this module with any other webcam, I'd be happy to hear about it.

If you want to use the wired PI-camera follow these steps provided by [@rev138](https://github.com/rejas/MMM-MotionDetector/issues/8#issuecomment-483356950):

- Open `/etc/modules-load.d/modules.conf`
- Add `bcm2835-v4l2` to the end of the file and save it.
- Reboot.
- Profit

Another tutorial on how to enable the PI-camera in the browser can be found [in this blog post](https://reprage.com/post/pi-camera-module-in-the-browser).

### Configuring MotionDetector with another module that requires MagicMirror address to be 0.0.0.0

You can do this by doing a simple workaround. You need to config the MagicMirror address to localhost (default)
and set up a reverse proxy for the other module.

As MagicMirror uses an express server, you can install http-proxy-middleware plugin for express.
Then you need to create 2 files:

routes.json

```json
{
  "routes": [
    {
      "route": "/mirror",
      "address": "http://localhost:8080"
    }
  ]
}
```

The `route` is any path you like, the `address` is the one of your MagicMirror.

proxyserver.js

```javascript
// Dependencies
const express = require("express");
const { createProxyMiddleware } = require("http-proxy-middleware");

// Config
const { routes } = require("./routes.json");

const app = express();

for (const route of routes) {
  app.use(
    route.route,
    createProxyMiddleware({
      target: route.address,
      pathRewrite: (path) => {
        return path.split("/").slice(2).join("/"); // Could use replace, but take care of the leading '/'
      }
    })
  );
}

// Start server and listen on port 8081
app.listen(8081, () => {});
```

Now just start the proxyserver e.g. with PM2 like you may run your MagicMirror.

You can now call http://ipaddress:8081/mirror/modulename and it will be forwarded to http://localhost:8080/modulename.

As you are bypassing browser security with this workaround you may want to add some credentials and/or ip-ranges which can access your proxyserver.

## Notifications sent

These are broadcast to the other modules on your mirror:

| Notification      | Payload            | Description                                                                               |
| ----------------- | ------------------ | ----------------------------------------------------------------------------------------- |
| `MOTION_DETECTED` | `{ score: <int> }` | number of pixels the diff-cam-engine saw change in the current frame, always 1 or greater |

`ACTIVATE_MONITOR` and `DEACTIVATE_MONITOR` are also sent, but only over the socket to this module's own node helper,
which switches the monitor on and off. They carry no payload and cannot be observed by other modules.

## Acknowledgements

Many thanks to

- [alexyak](https://github.com/alexyak/motiondetector) for the original module code
- [lonekorean](https://github.com/lonekorean/diff-cam-engine/) for the diff-cam-engine code.
