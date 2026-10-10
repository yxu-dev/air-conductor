# Stage A bench verification

Date: 2026-10-05. Branch: `dev-1`. Sensor not worn; Uno connected over USB on COM3. These results verify acquisition, calibration and serial communication before collecting conducting movements.

## Implemented behavior

- Six-axis sampling at a 10 ms interval, acceleration in m/s² and angular velocity in rad/s.
- Explicit 250-sample stationary calibration with motion/noise checks; READY only after acceptance.
- Raw telemetry, status, stream control and an idle I2C/identity scan.
- Python capture using the existing `infosci201-physical` Conda environment, with CSV events and JSON statistics.

Calibration references remain in RAM and are invalidated by reset or a new CALIBRATE command. The stream stays raw, including gravity and gyro bias. Worn movements and beat detection are the next milestone.

## Hardware identification and upload

The connected module acknowledges address `0x68` but reports `WHO_AM_I=0x70`, the identity assigned to MPU6500. The installed Adafruit MPU6050 library expects identity `0x68`, so its initial initialization failed on this module.

The firmware now configures identity `0x68` through Adafruit and identity `0x70` through a local MPU6500 path with register readback checks. Unknown identities are rejected. Both paths use checked burst reads; installed Arduino libraries were not edited. See [protocol and manufacturer references](serial-protocol.md#hardware-compatibility).

The exact `arduino/AirConductor/AirConductor.ino` sketch was compiled and uploaded with the bundled Arduino CLI for `arduino:avr:uno`, after confirming COM3. Final build: 15,334 bytes flash (47%), 721 bytes global RAM (35%). The MPU6500 path was exercised on this hardware; the MPU6050 path was not tested on a second module.

## Recorded results

The capture duration includes approximately two seconds of startup waiting. Rates below use the device millisecond timestamps.

| Capture | Total duration | Valid IMU samples | Device rate | Maximum interval | Invalid frames / intervals >30 ms |
| --- | ---: | ---: | ---: | ---: | ---: |
| Initial successful capture | 20 s | 1,789 | 100.006 Hz | 12 ms | 0 / 0 |
| Continuous capture | 305 s | 30,179 | 100.000 Hz | 12 ms | 0 / 0 |
| Shutdown verification | 10 s | 795 | 100.013 Hz | 12 ms | 0 / 0 |

All three captures reached READY and had no read errors, device timestamp resets or duplicate timestamps. Five-minute calibration returned maximum per-axis standard deviations of 0.01070 m/s² and 0.00065 rad/s for its calibration window. The longer stream contains small motion/position changes and should not be treated as a controlled stationary noise experiment.

The first two captures used the initial logger, which closed after sending STREAM,OFF and could leave a partial last line. The final logger drains queued data until the stop acknowledgement, with a one-second timeout. Its separate shutdown verification returned `stream_stopped=true` and `incomplete_final_frame=false`. The firmware was unchanged between these captures.

Local files, intentionally ignored by Git:

- `recordings/bench-compatible.csv` and `.summary.json`
- `recordings/bench-five-minutes.csv` and `.summary.json`
- `recordings/bench-clean-shutdown.csv` and `.summary.json`
- `recordings/bench-command-checks.json`

## Command and parser checks

Hardware checks passed for initial UNCALIBRATED status; idle SCAN/address/identity; unknown and oversized command recovery; STREAM,ON with valid samples; SCAN_BUSY while streaming; CALIBRATING and CALIBRATION_BUSY; READY queries; STREAM,OFF with no subsequent telemetry; and repeat calibration while streaming is off.

`python -m unittest discover -s diagnostics/tests -v` passed all four tests: fragmented/corrupt frame recovery, sample validation, clock wrap versus restart, and sampling-gap/axis statistics.

## Next measurement

Mount the sensor in its intended worn position, keep still and recalibrate. Record labeled downstrokes, return movements, pauses and different conducting speeds before selecting axes, thresholds and stroke-detector timing. Movement-based calibration rejection and worn beat accuracy have not yet been exercised with a participant.
