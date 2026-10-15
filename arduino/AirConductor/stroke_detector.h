#pragma once

#include <stdint.h>

struct BeatEvent {
  uint32_t timestampMs;
  float intensity;
};

class StrokeDetector {
 public:
  void reset();
  bool update(float motionScore, float directedGyro, uint32_t timestampMs, BeatEvent &event);
 private:
  enum class State { WaitRelease, Ready, Tracking };
  State state_ = State::WaitRelease;
  bool hasSample_ = false;
  bool hasBeat_ = false;
  uint32_t previousSampleMs_ = 0;
  uint32_t startMs_ = 0;
  uint32_t peakMs_ = 0;
  uint32_t lastBeatMs_ = 0;
  float peakGyro_ = 0;
  float peakScore_ = 0;
};
