#pragma once
#include <Adafruit_MPU6050.h>
#include <Arduino.h>

struct ImuSample {
  unsigned long timestampMs;
  // Raw acceleration (m/s^2), then raw angular velocity (rad/s).
  float values[6];
};
enum class CalibrationResult { Pending, Accepted, Rejected };

class ImuController {
 public:
  bool begin();
  bool read(ImuSample &sample);
  void startCalibration();
  CalibrationResult updateCalibration(const ImuSample &sample);
  void printCalibration(Print &output) const;
  bool healthy() const { return healthy_; }
  bool calibrating() const { return calibrating_; }
  bool calibrated() const { return calibrated_; }
  uint8_t address() const { return address_; }
  uint8_t identity() const { return identity_; }
  float gyroBias(uint8_t axis) const { return mean_[axis + 3]; }
  float accelerationReference() const { return gravityReference_; }
 private:
  bool readRegisters(uint8_t reg, uint8_t *data, uint8_t count);
  bool writeRegister(uint8_t reg, uint8_t value);
  bool begin6500();
  Adafruit_MPU6050 mpu_;
  uint8_t address_ = 0x68;
  uint8_t identity_ = 0;
  bool healthy_ = false;
  bool calibrating_ = false;
  bool calibrated_ = false;
  bool motionDetected_ = false;
  uint16_t count_ = 0;
  float mean_[6] = {};
  float m2_[6] = {};
  float accelStd_ = 0;
  float gyroStd_ = 0;
  float gravityReference_ = 0;
};
