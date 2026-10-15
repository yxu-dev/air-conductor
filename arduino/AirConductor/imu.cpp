#include "imu.h"
#include "config.h"
#include <Wire.h>
#include <math.h>

bool ImuController::begin() {
  Wire.begin();
  Wire.setWireTimeout(25000, true);
  address_ = Config::IMU_ADDRESS;
  Wire.beginTransmission(address_);
  if (Wire.endTransmission() != 0) {
    address_ = 0x69; // AD0 high uses the alternate MPU6050 address.
    Wire.beginTransmission(address_);
    if (Wire.endTransmission() != 0) return false;
  }
  if (!readRegisters(0x75, &identity_, 1)) return false;
  if (identity_ == 0x68) {
    healthy_ = mpu_.begin(address_, &Wire);
    if (!healthy_) return false;
    mpu_.setAccelerometerRange(MPU6050_RANGE_8_G);
    mpu_.setGyroRange(MPU6050_RANGE_500_DEG);
    mpu_.setFilterBandwidth(MPU6050_BAND_21_HZ);
    mpu_.setSampleRateDivisor(9);
  } else if (identity_ == 0x70) {
    healthy_ = begin6500();
  }
  return healthy_; // Reject unknown IDs instead of bypassing the identity check.
}

bool ImuController::readRegisters(uint8_t reg, uint8_t *data, uint8_t count) {
  Wire.clearWireTimeoutFlag();
  Wire.beginTransmission(address_);
  Wire.write(reg);
  if (Wire.endTransmission(false) != 0) return false;
  if (Wire.requestFrom(address_, count) != count) {
    while (Wire.available()) Wire.read();
    return false;
  }
  for (uint8_t i = 0; i < count; ++i) data[i] = Wire.read();
  return !Wire.getWireTimeoutFlag();
}

bool ImuController::writeRegister(uint8_t reg, uint8_t value) {
  Wire.clearWireTimeoutFlag();
  Wire.beginTransmission(address_);
  Wire.write(reg);
  Wire.write(value);
  return Wire.endTransmission() == 0 && !Wire.getWireTimeoutFlag();
}

bool ImuController::begin6500() {
  // TDK RM-MPU-6500A-00: gyro FCHOICE_B=00 + DLPF_CFG=4 gives 20 Hz/1 kHz.
  // ACCEL_CONFIG2=4 enables the accelerometer's 20 Hz low-pass filter.
  if (!writeRegister(0x6B, 0x80)) return false; // Reset.
  delay(100);
  const uint8_t registers[] = {0x6B, 0x6C, 0x19, 0x1A, 0x1B, 0x1C, 0x1D};
  const uint8_t values[] = {0x01, 0x00, 9, 4, 0x08, 0x10, 4};
  for (uint8_t i = 0; i < sizeof(registers); ++i) {
    uint8_t actual;
    if (!writeRegister(registers[i], values[i]) ||
        !readRegisters(registers[i], &actual, 1) || actual != values[i]) return false;
  }
  delay(100); // Let gyro and filters settle before the calibration window.
  return true;
}

bool ImuController::read(ImuSample &sample) {
  // Shared burst layout: acceleration, temperature (skipped), angular velocity.
  // Unlike Adafruit 2.2.9 getEvent(), this propagates short reads and NACKs.
  uint8_t bytes[14];
  sample.timestampMs = millis();
  if (!readRegisters(0x3B, bytes, sizeof(bytes))) {
    healthy_ = calibrated_ = calibrating_ = false;
    return false;
  }
  for (uint8_t i = 0; i < 6; ++i) {
    const uint8_t offset = i < 3 ? i * 2 : i * 2 + 2;
    const int16_t raw = static_cast<int16_t>((static_cast<uint16_t>(bytes[offset]) << 8) | bytes[offset + 1]);
    sample.values[i] = i < 3 ? raw * (9.80665f / 4096.0f) : raw * (0.01745329252f / 65.5f);
  }
  return true;
}

void ImuController::startCalibration() {
  calibrated_ = false;
  calibrating_ = true;
  motionDetected_ = false;
  count_ = 0;
  accelStd_ = gyroStd_ = 0;
  gravityReference_ = 0;
  for (uint8_t i = 0; i < 6; ++i) mean_[i] = m2_[i] = 0;
}

CalibrationResult ImuController::updateCalibration(const ImuSample &sample) {
  if (!calibrating_) return CalibrationResult::Pending;
  ++count_;
  float accelSquared = 0;
  float gyroSquared = 0;
  for (uint8_t i = 0; i < 6; ++i) {
    const float value = sample.values[i];
    const float delta = value - mean_[i];
    mean_[i] += delta / count_;
    m2_[i] += delta * (value - mean_[i]);
    if (i < 3) accelSquared += value * value;
    else gyroSquared += value * value;
  }
  const float accelMagnitude = sqrtf(accelSquared);
  if (sqrtf(gyroSquared) > Config::MAX_CALIBRATION_GYRO ||
      accelMagnitude < Config::MIN_REST_ACCEL ||
      accelMagnitude > Config::MAX_REST_ACCEL) motionDetected_ = true;
  if (count_ < Config::CALIBRATION_SAMPLES) return CalibrationResult::Pending;
  calibrating_ = false;
  for (uint8_t i = 0; i < 6; ++i) {
    const float deviation = sqrtf(fmaxf(0, m2_[i] / (count_ - 1)));
    if (i < 3) accelStd_ = fmaxf(accelStd_, deviation);
    else gyroStd_ = fmaxf(gyroStd_, deviation);
  }
  calibrated_ = !motionDetected_ && accelStd_ <= Config::MAX_ACCEL_STD &&
                gyroStd_ <= Config::MAX_GYRO_STD;
  if (calibrated_) gravityReference_ = sqrtf(mean_[0] * mean_[0] + mean_[1] * mean_[1] + mean_[2] * mean_[2]);
  return calibrated_ ? CalibrationResult::Accepted : CalibrationResult::Rejected;
}

void ImuController::printCalibration(Print &output) const {
  // Static acceleration reference, raw gyro bias, maximum per-axis noise.
  output.print(F("CALIBRATION"));
  for (uint8_t i = 0; i < 6; ++i) { output.print(','); output.print(mean_[i], 5); }
  output.print(',');
  output.print(accelStd_, 5);
  output.print(',');
  output.println(gyroStd_, 5);
}
