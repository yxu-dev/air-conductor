#pragma once

#include <Arduino.h>

struct BeatEvent {
  unsigned long timestampMs;
  float intensity;
};

class StrokeDetector {
 public:
  void reset();
  // Skeleton only: currently returns false for every sample.
  bool update(float motionScore, unsigned long timestampMs, BeatEvent &event);
};
