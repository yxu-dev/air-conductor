#pragma once

#include <stdint.h>

namespace Config {
constexpr unsigned long SERIAL_BAUD = 115200;
constexpr unsigned long SAMPLE_INTERVAL_MS = 10;
constexpr uint8_t IMU_ADDRESS = 0x68;
constexpr uint16_t CALIBRATION_SAMPLES = 250;
constexpr float MAX_ACCEL_STD = 0.25f;        // m/s^2 per axis
constexpr float MAX_GYRO_STD = 0.05f;         // rad/s per axis
constexpr float MAX_CALIBRATION_GYRO = 0.30f; // rad/s, including bias
constexpr float MIN_REST_ACCEL = 8.0f;       // m/s^2, broad sanity bounds
constexpr float MAX_REST_ACCEL = 12.0f;
// Stationary-calibration guards, not conducting thresholds.
constexpr uint8_t PRIMARY_GYRO_AXIS = 0; // Current right-hand mounting: gx.
constexpr float STROKE_DIRECTION = -1.0f; // Current wearer: downward gx is negative; upward was counted.
constexpr float STROKE_HIGH = 0.8f;      // rad/s, bias-corrected directed gyro.
constexpr float STROKE_LOW = 0.25f;
constexpr float MOTION_HIGH = 1.5f;
constexpr float MIN_PEAK_SCORE = 4.0f;   // Reject low-energy return rebounds.
constexpr float GYRO_WEIGHT = 2.0f;
constexpr float INTENSITY_FULL_SCALE = 16.0f; // Motion-score units; not MIDI velocity.
constexpr uint32_t MIN_STROKE_MS = 90; // Measured rebounds 50–60 ms; downstrokes >=140 ms.
constexpr uint32_t MAX_STROKE_MS = 600;
constexpr uint32_t MIN_BEAT_GAP_MS = 280;
constexpr uint32_t MAX_SAMPLE_GAP_MS = 30;
// Corona candidates: verify with the worn sensor before showcase use.
constexpr float CORONA_STILL_SCORE = 0.65f;
constexpr float CORONA_MOVING_SCORE = 1.2f;
constexpr uint32_t CORONA_STILL_MS = 500;
constexpr uint32_t CORONA_MOVING_MS = 40;
}
