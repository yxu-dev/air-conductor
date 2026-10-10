// Host harness for the exact firmware state machine, not a translated detector.
#include "stroke_detector.h"
#include <cstdlib>
#include <iomanip>
#include <iostream>
#include <sstream>
#include <string>

int main() {
  StrokeDetector detector;
  std::string line;
  while (std::getline(std::cin, line)) {
    if (line == "RESET") { detector.reset(); continue; }
    std::istringstream input(line);
    std::string field;
    std::getline(input, field, ',');
    if (field != "S") return 2;
    std::getline(input, field, ',');
    const uint32_t timestamp = static_cast<uint32_t>(std::stoul(field));
    std::getline(input, field, ',');
    const float score = std::stof(field);
    std::getline(input, field, ',');
    const float direction = std::stof(field);
    BeatEvent beat;
    if (detector.update(score, direction, timestamp, beat)) {
      std::cout << "BEAT," << beat.timestampMs << ',' << std::setprecision(8)
                << beat.intensity << ',' << timestamp << '\n';
    }
  }
}
