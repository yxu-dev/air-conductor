#include "config.h"
#include "imu.h"
#include "stroke_detector.h"
#include <math.h>
#include <string.h>
#include <Wire.h>

ImuController imu;
StrokeDetector detector;
bool streaming = false;
bool detecting = false;
unsigned long lastSampleMs = 0;
char command[32];
uint8_t commandLength = 0;
bool discardCommand = false;

void reportStatus() {
  Serial.print(F("STATUS,"));
  if (!imu.healthy()) Serial.println(F("SENSOR_ERROR"));
  else if (imu.calibrating()) Serial.println(F("CALIBRATING"));
  else if (imu.calibrated()) Serial.println(F("READY"));
  else Serial.println(F("UNCALIBRATED"));
}

void handleCommand(const char *line) {
  if (strcmp(line, "STATUS") == 0) reportStatus();
  else if (strcmp(line, "SCAN") == 0) {
    if (streaming || detecting || imu.calibrating()) { Serial.println(F("ERROR,SCAN_BUSY")); return; }
    bool found = false;
    for (uint8_t address = 1; address < 127; ++address) {
      Wire.beginTransmission(address);
      if (Wire.endTransmission() == 0) {
        found = true;
        Serial.print(F("I2C,0x"));
        Serial.println(address, HEX);
        if (address == 0x68 || address == 0x69) {
          Wire.beginTransmission(address);
          Wire.write(0x75); // WHO_AM_I, read-only device identification.
          if (Wire.endTransmission(false) == 0 && Wire.requestFrom(address, static_cast<uint8_t>(1)) == 1) {
            Serial.print(F("WHO_AM_I,0x"));
            Serial.print(address, HEX);
            Serial.print(F(",0x"));
            Serial.println(Wire.read(), HEX);
          } else Serial.println(F("ERROR,IDENTITY_READ_FAILED"));
        }
      }
    }
    if (!found) Serial.println(F("I2C,NONE"));
    Serial.println(F("I2C,DONE"));
  }
  else if (strcmp(line, "STREAM,OFF") == 0) {
    streaming = false;
    Serial.println(F("STREAM,OFF"));
  } else if (strcmp(line, "DETECT,OFF") == 0) {
    detecting = false;
    detector.reset();
    Serial.println(F("DETECT,OFF"));
  } else if (!imu.healthy()) Serial.println(F("ERROR,SENSOR_UNAVAILABLE"));
  else if (strcmp(line, "STREAM,ON") == 0) {
    streaming = true;
    Serial.println(F("STREAM,ON"));
  } else if (strcmp(line, "DETECT,ON") == 0) {
    if (!imu.calibrated()) Serial.println(F("ERROR,NOT_CALIBRATED"));
    else {
      if (!detecting) detector.reset();
      detecting = true;
      Serial.println(F("DETECT,ON"));
    }
  } else if (strcmp(line, "CALIBRATE") == 0) {
    if (imu.calibrating()) Serial.println(F("ERROR,CALIBRATION_BUSY"));
    else {
      detecting = false;
      detector.reset();
      Serial.println(F("DETECT,OFF"));
      imu.startCalibration();
      reportStatus();
    }
  } else Serial.println(F("ERROR,UNKNOWN_COMMAND"));
}

void readCommands() {
  uint8_t budget = 32; // Bound work to avoid starving sampling.
  while (Serial.available() && budget--) {
    const char ch = static_cast<char>(Serial.read());
    if (ch == '\n') {
      if (discardCommand) Serial.println(F("ERROR,COMMAND_TOO_LONG"));
      else if (commandLength) { command[commandLength] = '\0'; handleCommand(command); }
      commandLength = 0;
      discardCommand = false;
    } else if (ch != '\r' && !discardCommand) {
      if (commandLength < sizeof(command) - 1) command[commandLength++] = ch;
      else discardCommand = true;
    }
  }
}

void printSample(const ImuSample &sample) {
  Serial.print(F("IMU,"));
  Serial.print(sample.timestampMs);
  for (uint8_t i = 0; i < 6; ++i) { Serial.print(','); Serial.print(sample.values[i], 4); }
  Serial.println();
}

void setup() {
  Serial.begin(Config::SERIAL_BAUD);
  Serial.println(F("BOOT,1"));
  if (!imu.begin()) Serial.println(F("ERROR,IMU_INIT_FAILED"));
  else {
    Serial.print(F("INFO,IMU,"));
    Serial.print(imu.identity() == 0x70 ? F("MPU6500") : F("MPU6050"));
    Serial.print(',');
    Serial.println(imu.address());
  }
  reportStatus();
  lastSampleMs = millis();
}

void loop() {
  readCommands();
  if (!imu.healthy()) return;
  const unsigned long now = millis();
  if (now - lastSampleMs < Config::SAMPLE_INTERVAL_MS) return;
  // Skip missed slots, never emit catch-up bursts.
  const unsigned long elapsed = now - lastSampleMs;
  lastSampleMs += (elapsed / Config::SAMPLE_INTERVAL_MS) * Config::SAMPLE_INTERVAL_MS;
  ImuSample sample;
  if (!imu.read(sample)) {
    streaming = detecting = false;
    detector.reset();
    Serial.println(F("ERROR,IMU_READ_FAILED"));
    reportStatus();
    return;
  }
  const CalibrationResult result = imu.updateCalibration(sample);
  if (streaming) printSample(sample);
  if (result == CalibrationResult::Accepted) {
    imu.printCalibration(Serial);
    Serial.println(F("READY"));
  } else if (result == CalibrationResult::Rejected) {
    Serial.println(F("ERROR,CALIBRATION_NOT_STILL"));
    reportStatus();
  }
  if (detecting && imu.calibrated()) {
    float accelSquared = 0;
    float gyroSquared = 0;
    for (uint8_t axis = 0; axis < 3; ++axis) {
      accelSquared += sample.values[axis] * sample.values[axis];
      const float gyro = sample.values[axis + 3] - imu.gyroBias(axis);
      gyroSquared += gyro * gyro;
    }
    const float score = fabsf(sqrtf(accelSquared) - imu.accelerationReference()) +
                        Config::GYRO_WEIGHT * sqrtf(gyroSquared);
    const float direction = Config::STROKE_DIRECTION *
      (sample.values[Config::PRIMARY_GYRO_AXIS + 3] - imu.gyroBias(Config::PRIMARY_GYRO_AXIS));
    BeatEvent beat;
    if (detector.update(score, direction, sample.timestampMs, beat)) {
      Serial.print(F("BEAT,"));
      Serial.print(beat.timestampMs);
      Serial.print(',');
      Serial.println(beat.intensity, 3);
    }
  }
}
