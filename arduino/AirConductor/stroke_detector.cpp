#include "stroke_detector.h"
#include "config.h"
#include <math.h>

void StrokeDetector::reset() {
  state_ = State::WaitRelease;
  hasSample_ = hasBeat_ = false;
  previousSampleMs_ = startMs_ = peakMs_ = lastBeatMs_ = 0;
  peakGyro_ = peakScore_ = 0;
}

bool StrokeDetector::update(float motionScore, float directedGyro, uint32_t timestampMs,
                            BeatEvent &event) {
  if (!isfinite(motionScore) || !isfinite(directedGyro) || motionScore < 0) {
    reset();
    return false;
  }
  // Unsigned subtraction handles the 32-bit millis() wrap. A reset or gap
  // invalidates an unfinished stroke and requires a fresh release sample.
  if (hasSample_ && uint32_t(timestampMs - previousSampleMs_) > Config::MAX_SAMPLE_GAP_MS) reset();
  previousSampleMs_ = timestampMs;
  hasSample_ = true;
  if (state_ == State::WaitRelease) {
    if (directedGyro < Config::STROKE_LOW) state_ = State::Ready;
    return false;
  }
  if (state_ == State::Ready) {
    if (directedGyro > Config::STROKE_HIGH && motionScore > Config::MOTION_HIGH) {
      state_ = State::Tracking;
      startMs_ = peakMs_ = timestampMs;
      peakGyro_ = directedGyro;
      peakScore_ = motionScore;
    }
    return false;
  }
  const uint32_t duration = timestampMs - startMs_;
  if (duration > Config::MAX_STROKE_MS) {
    state_ = State::WaitRelease;
    return false;
  }
  if (directedGyro > peakGyro_) {
    peakGyro_ = directedGyro;
    peakMs_ = timestampMs;
  }
  if (motionScore > peakScore_) peakScore_ = motionScore;
  if (directedGyro < Config::STROKE_LOW) {
    state_ = State::WaitRelease;
    if (duration < Config::MIN_STROKE_MS || peakScore_ < Config::MIN_PEAK_SCORE ||
        (hasBeat_ && uint32_t(peakMs_ - lastBeatMs_) < Config::MIN_BEAT_GAP_MS)) return false;
    event.timestampMs = peakMs_;
    event.intensity = fminf(1.0f, fmaxf(0.0f, peakScore_ / Config::INTENSITY_FULL_SCALE));
    lastBeatMs_ = peakMs_;
    hasBeat_ = true;
    return true;
  }
  return false;
}
