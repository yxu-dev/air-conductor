#pragma once

#include <Arduino.h>

namespace Config {
constexpr unsigned long SERIAL_BAUD = 115200;
constexpr unsigned long SAMPLE_INTERVAL_MS = 10;
// Detection thresholds must be selected from recorded wrist-motion data.
}
