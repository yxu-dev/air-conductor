#include "config.h"
#include "stroke_detector.h"

StrokeDetector detector;

void setup() {
  Serial.begin(Config::SERIAL_BAUD);
  detector.reset();
  Serial.println("STATUS,SCAFFOLD");
  // TODO: Initialize MPU6050 and wait for an explicit calibration command.
}

void loop() {
  // TODO: Sample IMU on a fixed interval, process commands, emit beat events.
}
