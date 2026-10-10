# Serial protocol — Stages A/B

115200 baud, ASCII, one message per line, newline terminated. Receivers accept CRLF or LF. Firmware checks addresses 0x68/0x69 and rejects unknown chip identities. Sampling targets 100 Hz, ±8 g, ±500 deg/s; low-pass bandwidth is 21 Hz for MPU6050 or 20 Hz for MPU6500. Output units are m/s² and rad/s (not g or deg/s).

## Device → host

| Message | Meaning |
| --- | --- |
| `BOOT,1` | Firmware protocol version 1; clears previous session state |
| `INFO,IMU,<model>,<address>` | Detected model and decimal I2C address; 104 means 0x68 |
| `STATUS,UNCALIBRATED` | Sensor initialized, waiting for an explicit stationary calibration |
| `STATUS,CALIBRATING` | Stationary calibration in progress |
| `STATUS,READY` | A status query confirms successful calibration |
| `STATUS,SENSOR_ERROR` | Sensor initialization/read failed; reset after fixing the connection |
| `READY` | Sensor initialized and calibration completed |
| `IMU,<timestamp_ms>,<ax>,<ay>,<az>,<gx>,<gy>,<gz>` | Raw six-axis sample, only when streaming is enabled |
| `CALIBRATION,<ax0>,<ay0>,<az0>,<gx0>,<gy0>,<gz0>,<accel_std>,<gyro_std>` | Static acceleration reference, raw gyro bias, maximum per-axis sample standard deviations |
| `STREAM,ON` / `STREAM,OFF` | Acknowledges the stream command |
| `DETECT,ON` / `DETECT,OFF` | Acknowledges beat detection control; CALIBRATE also emits DETECT,OFF |
| `BEAT,<timestamp_ms>,<intensity>` | Accepted downstroke peak time and intensity in [0,1], emitted after release |
| `ERROR,<code>` | Sensor, calibration or command error |

READY means sampling calibration completed. Beat detection starts only after DETECT,ON; music playback is not implemented yet.

## Host → device

- `STATUS`: query sensor/calibration state.
- `STREAM,ON`: enable raw telemetry; sampling also runs while streaming is off.
- `STREAM,OFF`: stop raw telemetry; independently enabled detection continues.
- `DETECT,ON`: enable beat detection after successful calibration; otherwise ERROR,NOT_CALIBRATED. Repeating the command while active does not erase its timing history.
- `DETECT,OFF`: stop beat output and clear unfinished stroke/timing state; works even after sensor failure.
- `CALIBRATE`: stop detection, invalidate the old reference and collect 250 samples (about 2.5 seconds). Place the sensor still on a desk for initial checks; recalibrate after wearing it and for each new participant. Explicitly re-enable detection after READY.
- `SCAN`: with streaming/detection off and calibration inactive, print `I2C,0x<address>` for responding devices, `WHO_AM_I,0x<address>,0x<identity>` for 0x68/0x69, then `I2C,DONE`. If no addresses respond, also print `I2C,NONE`.

Calibration uses online means and sample variance. Reject if any sample has angular-velocity magnitude >0.30 rad/s, acceleration magnitude outside 8–12 m/s², or maximum per-axis standard deviation exceeds 0.25 m/s² or 0.05 rad/s. These configurable guards reject obvious movement; they do not prove perfect stillness and are not conducting thresholds.

Successful calibration emits CALIBRATION followed by READY. Failure emits `ERROR,CALIBRATION_NOT_STILL`, then `STATUS,UNCALIBRATED`; keep the sensor still and retry. Raw telemetry is never baseline-subtracted: gyro bias must be applied by later motion processing; the static acceleration reference includes gravity and is not a world-coordinate gravity-removal algorithm.

Other errors: IMU_INIT_FAILED, IMU_READ_FAILED, SENSOR_UNAVAILABLE, CALIBRATION_BUSY, UNKNOWN_COMMAND, COMMAND_TOO_LONG, SCAN_BUSY, IDENTITY_READ_FAILED, NOT_CALIBRATED. Commands longer than 31 bytes are discarded through the next newline.

## Stroke detection

The current right-hand mounting uses directed gyro `-(gx - gx_bias)` >0.8 rad/s and motion score >1.5 to start a stroke. Release is directed gyro <0.25 rad/s. Accepted strokes must reach peak motion score ≥4, last 90–600 ms and have peak times at least 280 ms apart. Negative directed return motion cannot start a stroke. Raw gx is negative on this mounting's downstroke, positive on return; earlier captures used the opposite sign. A sampling gap >30 ms, invalid features, reset, DETECT,OFF or recalibration clears stroke history and requires a release sample before rearming.

BEAT reports the largest positive directed-gyro sample's timestamp. Its intensity is the stroke's maximum motion score divided by 16, clamped to [0,1]. Motion score is `abs(|accel|-|calibrated_accel|) + 2*|gyro-bias|`; it is not a calibrated measure of musical loudness. Peak timing and intensity may come from different samples of the same stroke. Because confirmation waits for release, the BEAT receipt is later than its peak timestamp. Details and measured delays are in [stroke detection](stroke-detection.md).

## Time and validation

- Beat timestamps use the Arduino's unsigned millisecond clock; timing differences must account for reset/wraparound.
- The browser uses device timestamps for intervals, and its own receipt clock for “last beat” age.
- Validate message type, field count, finite numeric values and intensity bounds.
- Reset tempo history when reconnecting or recalibrating.
- Ignore malformed lines and do not feed them into the tempo estimator.
- Both raw streaming and detection are off after boot. Opening a serial connection may reset Uno and invalidate calibration.
- Telemetry uses a checked 14-byte burst read: reject NACKs, short reads and Wire timeouts. Fix a sensor error and reset/reconnect before repeating calibration.

## Hardware compatibility

This project's bench module responded at 0x68 with WHO_AM_I=0x70. The MPU6500 register map assigns identity 0x70; the Adafruit MPU6050 library expects 0x68. Firmware uses the installed Adafruit library to configure identity 0x68, and a local MPU6500 register configuration with readback verification for identity 0x70. Installed library files are unchanged.

Both paths use the shared acceleration/gyro register layout and scales for the configured ranges. This identifies a compatible register interface; it is not a physical authenticity inspection of the module.

Manufacturer reference: [InvenSense MPU6500 register map, RM-MPU-6500A-00 Rev 2.1](https://www.tinytronics.nl/product_files/001439_MPU-6500-Register-Map2%20(1).pdf), especially sections 4.4–4.8, 4.22, 4.24 and 4.38. [Adafruit MPU6050 API](https://adafruit.github.io/Adafruit_MPU6050/html/_adafruit___m_p_u6050_8h.html).
