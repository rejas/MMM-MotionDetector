# Changelog

All notable changes to this project will be documented in this file.

This project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [develop](https://github.com/rejas/MMM-MotionDetector/compare/v1.8.0...develop) - unreleased

## [1.8.0](https://github.com/rejas/MMM-MotionDetector/compare/v1.7.0...v1.8.0) - 2026-07-21

### Added

- Unit test suite running on `node:test`, plus shellcheck and the tests in CI (#102)
- Validation of the `platform` option, unknown values are now refused instead of silently falling back to `x11` (#99)
- `engines` field requiring node `^22.22.1 || >=24`, matching what the dev toolchain already needs

### Changed

- `mac-arm` is documented as a supported platform, it always worked but the README listed `mac-intel` twice (#105)
- The monitor scripts are run through `execFile` rather than a shell string, so an install path containing spaces works
- Monitor commands are queued, so a slow `off` can no longer land after a later `on` and leave the screen dark
- Dev dependencies updated to their latest versions (#104)

### Fixed

- `scoreThreshold` and `pixelDiffThreshold` now honour an explicit `0` instead of silently using the default, and a frame where nothing changed is no longer reported as motion (#103)
- `motionBox` uses the same threshold comparison as `hasMotion`, so a frame can no longer count as motion without a box (#95)
- `DiffCamEngine.stop()` releases the camera tracks and detaches its `canplay` listener, so the indicator light goes out and a late event cannot restart capturing (#97)
- The powered off percentage includes the stretch that is currently running, it used to report the previous total at the moment of waking
- The node helper no longer logs that the monitor was activated directly after logging that it could not be
- Failures that never reached a script are logged with their message instead of `undefined`
- The module renders again when no motion was ever detected (#101)

### Removed

- `MOTION_DETECTED` is no longer sent over the socket. It is still broadcast to other modules, but the node helper never had a handler for the socket copy (#96)
- The `USER_PRESENCE` handler, which forwarded a notification the node helper has never sent (#107)
- The `isMonitorOn` status check before toggling, the scripts are idempotent (#100)

## [1.7.0](https://github.com/rejas/MMM-MotionDetector/compare/v1.6.0...v1.7.0) - 2025-11-15

- Update linting (#61)
- Update logging (#62)
- Added github actions for testing (#63)
- Added platform config option incl mac (#64, #65)
- Use async calls everywhere in module (#66)
- Update dependencies

## [1.6.0](https://github.com/rejas/MMM-MotionDetector/compare/v1.5.0...v1.6.0) - 2020-07-05

- Allow disabling the monitor-functionality and just get the motion detection
- Use Logger from MM² core
- Update dependencies

## [1.5.0](https://github.com/rejas/MMM-MotionDetector/compare/v1.4.0...v1.5.0) - 2019-07-14

- Show error on UI element when something goes wrong during initialization
- Cleaned up code
- Update dependencies

## [1.4.0](https://github.com/rejas/MMM-MotionDetector/compare/v1.3.0...v1.4.0) - 2019-03-08

- Updated code to getUserMedia from browser
- Cleaned up DOM template

## [1.3.0](https://github.com/rejas/MMM-MotionDetector/compare/v1.2.2...v1.3.0) - 2019-03-06

- Added time/percentage powered-off to DOM
- Switched to DOM templating

## [1.2.2](https://github.com/rejas/MMM-MotionDetector/compare/v1.2.1...v1.2.2) - 2019-03-06

- Switched to MM² codestyle
- Cleaned up code

## [1.2.1](https://github.com/rejas/MMM-MotionDetector/compare/v1.2.0...v1.2.1) - 2019-03-02

- Added eslint code styles

## [1.2.0](https://github.com/rejas/MMM-MotionDetector/compare/v1.1.0...v1.2.0) - 2019-03-01

- Added DOM for displaying basic debug information on the MagicMirror when a position is specified
- Updated documentation

## [1.1.0](https://github.com/rejas/MMM-MotionDetector/compare/v1.0.0...v1.1.0) - 2018-11-01

- Switched from tvservice to vcgencmd. Module can now be used with vc4-kms-v3d and vc4-fkms-v3d drivers.

## [1.0.0](https://github.com/rejas/MMM-MotionDetector/releases/tag/v1.0.0) - 2018-07-20

- Initial release
