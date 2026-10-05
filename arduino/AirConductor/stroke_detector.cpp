#include "stroke_detector.h"

void StrokeDetector::reset() {
  // TODO: Reset stroke state, peaks and timing anchors.
}

bool StrokeDetector::update(float motionScore, unsigned long timestampMs,
                            BeatEvent &event) {
  (void)motionScore;
  (void)timestampMs;
  (void)event;
  // TODO: Direction gating, hysteresis, release, refractory gap and timeout.
  return false;
}
