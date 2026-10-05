# Serial protocol (draft)

115200 baud, ASCII, one message per line, newline terminated. Receivers accept CRLF or LF. This contract will be finalized during firmware implementation.

## Device → host

| Message | Meaning |
| --- | --- |
| `STATUS,SCAFFOLD` | Current firmware is a skeleton, not calibrated or operational |
| `STATUS,CALIBRATING` | Stationary calibration in progress |
| `READY` | Sensor initialized and calibration completed |
| `BEAT,<timestamp_ms>,<intensity>` | Device beat timestamp and normalized intensity in [0, 1] |
| `ERROR,<code>` | Sensor or calibration failure |

Only `STATUS,SCAFFOLD` is implemented at present.

## Host → device (planned)

`CALIBRATE` begins calibration after the sensor is worn. A new participant may repeat it.

## Time and validation

- Beat timestamps use the Arduino's unsigned millisecond clock; timing differences must account for reset/wraparound.
- The browser uses device timestamps for intervals, and its own receipt clock for “last beat” age.
- Validate message type, field count, finite numeric values and intensity bounds.
- Reset tempo history when reconnecting or recalibrating.
- Ignore malformed lines and do not feed them into the tempo estimator.
- Raw IMU debug messages will be defined when the sample logger is implemented.
