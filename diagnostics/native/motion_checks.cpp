#include "motion_detector.h"
#include <cassert>
#include <iostream>
#include <limits>

int main() {
  MotionDetector detector;
  MotionState event;
  for (uint32_t t = 0; t < 500; t += 10) assert(!detector.update(.1f, t, event));
  assert(detector.update(.1f, 500, event) && event == MotionState::Still);
  for (uint32_t t = 510; t < 1000; t += 10) assert(!detector.update(.1f, t, event));
  // A 30 ms spike cannot resume; the hysteresis band clears the candidate.
  for (uint32_t t = 1000; t < 1040; t += 10) assert(!detector.update(2.f, t, event));
  assert(!detector.update(.9f, 1040, event));
  for (uint32_t t = 1050; t < 1090; t += 10) assert(!detector.update(2.f, t, event));
  assert(detector.update(2.f, 1090, event) && event == MotionState::Moving);
  // Brief conducting turnarounds do not produce still events.
  for (uint32_t t = 1100; t < 5000; t += 10) {
    assert(!detector.update(t % 1000 < 400 ? .1f : 2.f, t, event));
  }
  // Missing samples must restart the full still observation period.
  assert(!detector.update(.1f, 6000, event));
  for (uint32_t t = 6010; t < 6500; t += 10) assert(!detector.update(.1f, t, event));
  assert(detector.update(.1f, 6500, event) && event == MotionState::Still);
  assert(!detector.update(std::numeric_limits<float>::quiet_NaN(), 6510, event));
  for (uint32_t t = 6520; t < 6560; t += 10) assert(!detector.update(2.f, t, event));
  assert(detector.update(2.f, 6560, event) && event == MotionState::Moving);
  detector.reset();
  const uint32_t start = UINT32_MAX - 199;
  for (uint32_t dt = 0; dt < 500; dt += 10) assert(!detector.update(.1f, start + dt, event));
  assert(detector.update(.1f, start + 500, event) && event == MotionState::Still);
  std::cout << "Motion transition, hysteresis, gap, invalid input and wrap checks passed\n";
}
