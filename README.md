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

Getting the camera to work on current Raspberry Pi OS releases is still unresolved, see
[issue #56](https://github.com/rejas/MMM-MotionDetector/issues/56). The workaround that used to be documented here
relied on the legacy camera stack, which no longer exists on Bookworm and later, so it has been removed rather than
left as misleading advice.

Any help getting this module running on current Raspberry Pi OS is greatly appreciated.

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

| Option                | Description                                                                                                            | Default value |
| --------------------- | ---------------------------------------------------------------------------------------------------------------------- | ------------- |
| `captureIntervalTime` | Time in ms between capturing images for detection                                                                      | `1000`        |
| `deviceId`            | (optional) specify which camera to use in case multiple exist in the system.                                           |               |
| `platform`            | On what platforms this runs. <br><br>**Possible values:** `cec` (untested), `labwc`, `mac-arm`, `mac-intel`, `x11`     | `x11`         |
| `scoreThreshold`      | Threshold minimum for an image to be considered significant.<br><br>Set to 0 to treat any movement as motion           | `20`          |
| `timeout`             | Time in ms after which monitor is turned off when no motion is detected<br><br>Set to -1 to never turn off the monitor | `120000`      |

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
