#pragma once
#include <stdint.h>
#include <math.h>
#include "config.h"

enum class MotionState { Unknown, Moving, Still };

// Independent of stroke direction and beat timing. Events occur only on transitions.
class MotionDetector {
 public:
  void reset() { state_ = candidate_ = MotionState::Unknown; sampled_ = false; }
  bool update(float score, uint32_t now, MotionState &event) {
    if (!isfinite(score) || score < 0) { reset(); return false; }
    if (sampled_ && uint32_t(now - previous_) > Config::MAX_SAMPLE_GAP_MS) reset();
    previous_ = now;
    sampled_ = true;
    const MotionState next = score <= Config::CORONA_STILL_SCORE ? MotionState::Still :
      score >= Config::CORONA_MOVING_SCORE ? MotionState::Moving : MotionState::Unknown;
    if (next == MotionState::Unknown || next == state_) { candidate_ = MotionState::Unknown; return false; }
    if (next != candidate_) { candidate_ = next; since_ = now; }
    const uint32_t duration = next == MotionState::Still ? Config::CORONA_STILL_MS : Config::CORONA_MOVING_MS;
    if (uint32_t(now - since_) < duration) return false;
    state_ = next;
    candidate_ = MotionState::Unknown;
    event = state_;
    return true;
  }
 private:
  MotionState state_ = MotionState::Unknown, candidate_ = MotionState::Unknown;
  bool sampled_ = false;
  uint32_t previous_ = 0, since_ = 0;
};
