"""Replay recorded IMU through the actual C++ firmware detector on this host."""

import argparse
from collections import Counter
import csv
import json
from pathlib import Path
import re
import statistics

from analyze_motion import analyze
from native_runner import ROOT, compiled_detector, run_detector


def mounting_settings():
    """Read direction/axis from the firmware, whose runner expects directed gyro."""
    header = (ROOT / 'arduino' / 'AirConductor' / 'config.h').read_text(encoding='utf-8')
    axis = int(re.search(r'PRIMARY_GYRO_AXIS\s*=\s*(\d+)', header).group(1))
    direction = float(re.search(r'STROKE_DIRECTION\s*=\s*([+-]?\d+(?:\.\d+)?)', header).group(1))
    if axis not in (0, 1, 2) or direction not in (-1.0, 1.0):
        raise ValueError('Firmware mounting requires axis 0–2 and direction -1 or 1')
    return axis, direction


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("recording", type=Path)
    parser.add_argument("--output-prefix", type=Path, help="Fresh output prefix for replaying a new detector version")
    parser.add_argument('--axis', choices=('gx', 'gy', 'gz'), help='Override current firmware axis for a historical recording')
    parser.add_argument('--direction', type=int, choices=(-1, 1), help='Override current firmware sign for a historical recording')
    args = parser.parse_args()
    prefix = args.output_prefix or args.recording.with_suffix(".replay")
    csv_path = Path(str(prefix) + ".csv")
    summary_path = Path(str(prefix) + ".json")
    if csv_path.exists() or summary_path.exists():
        parser.error("Replay output already exists; choose a fresh recording")
    _, samples, _ = analyze(args.recording)
    samples = [s for s in samples if s["phase"] != "calibration"]
    axis, direction = mounting_settings()
    if args.axis is not None:
        axis = ('gx', 'gy', 'gz').index(args.axis)
    if args.direction is not None:
        direction = args.direction
    with compiled_detector() as executable:
        beats = run_detector(executable, [(s["device_ms"], s["score"], direction * s["gyro"][axis]) for s in samples])
    by_time = {s["device_ms"]: s for s in samples}
    for beat in beats:
        peak = by_time[beat["timestamp_ms"]]
        beat.update(host_s=peak["host_s"], phase=peak["phase"])
    with csv_path.open("x", encoding="utf-8", newline="") as output:
        writer = csv.DictWriter(output, fieldnames=("timestamp_ms", "intensity", "emitted_ms", "release_delay_ms", "host_s", "phase"))
        writer.writeheader()
        writer.writerows(beats)
    delays = [b["release_delay_ms"] for b in beats]
    report = {"recording": str(args.recording.resolve()), "beats": len(beats),
              "axis": ('gx', 'gy', 'gz')[axis], "direction": direction,
              "by_host_phase": dict(Counter(b["phase"] for b in beats)),
              "release_delay_median_ms": statistics.median(delays) if delays else None,
              "release_delay_max_ms": max(delays, default=None),
              "note": "Same C++ state machine; host-side features use printed calibration/raw values. Phase counts are cue windows, not beat accuracy."}
    with summary_path.open("x", encoding="utf-8") as output:
        json.dump(report, output, indent=2)
    print(json.dumps(report, indent=2))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
