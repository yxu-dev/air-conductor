"""Analyze firmware BEAT output against raw samples and host instruction windows."""

import argparse
from collections import defaultdict
import csv
import json
from pathlib import Path
import statistics

from analyze_motion import analyze, plot_motion
from read_serial import parse_beat


def analyze_beats(recording):
    _, samples, cues = analyze(recording)
    raw = {s["device_ms"]: s for s in samples}
    events, invalid = [], 0
    with recording.open(encoding="utf-8", newline="") as source:
        for row in csv.DictReader(source):
            if row["type"] not in ("BEAT", "INVALID_BEAT"):
                continue
            try:
                timestamp, intensity = parse_beat(row["payload"])
            except ValueError:
                invalid += 1
                continue
            peak = raw.get(timestamp)
            events.append({"timestamp_ms": timestamp, "intensity": intensity,
                           "receipt_host_s": float(row["host_elapsed_s"]),
                           "phase": peak["phase"] if peak else "unmatched",
                           "host_s": peak["host_s"] if peak else None,
                           "score": peak["score"] if peak else None,
                           "gyro": peak["gyro"] if peak else None})
    groups = defaultdict(list)
    for event in events:
        groups[event["phase"]].append(event)
    by_phase = {}
    for phase in dict.fromkeys(s["phase"] for s in samples):
        group = groups[phase]
        intervals = [(b["timestamp_ms"] - a["timestamp_ms"]) % 2**32 for a, b in zip(group, group[1:])]
        median = statistics.median(intervals) if intervals else None
        by_phase[phase] = {"beats": len(group), "median_interval_ms": median,
                           "median_bpm": 60000 / median if median else None,
                           "intervals_below_280ms": sum(dt < 280 for dt in intervals)}
    delays = [e["receipt_host_s"] - e["host_s"] for e in events if e["host_s"] is not None]
    report = {"recording": str(recording.resolve()), "beats": len(events), "invalid_beats": invalid,
              "unmatched_peak_timestamps": sum(e["host_s"] is None for e in events),
              "by_peak_phase": by_phase,
              "receipt_delay_median_s": statistics.median(delays) if delays else None,
              "receipt_delay_max_s": max(delays, default=None),
              "note": "Phases use raw samples at the reported peak, not the later BEAT receipt. Host instructions are not observed beat ground truth."}
    return report, samples, cues, events


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("recording", type=Path)
    parser.add_argument("--plot", action="store_true")
    args = parser.parse_args()
    report_path = args.recording.with_suffix(".beats.json")
    plot_path = args.recording.with_suffix(".beats.png")
    if report_path.exists() or (args.plot and plot_path.exists()):
        parser.error("Beat-analysis output already exists")
    try:
        report, samples, cues, events = analyze_beats(args.recording)
    except (OSError, ValueError, KeyError) as exc:
        parser.error(str(exc))
    with report_path.open("x", encoding="utf-8") as output:
        json.dump(report, output, indent=2, allow_nan=False)
    if args.plot:
        plot_motion(plot_path, samples, cues, beats=events)
    print(json.dumps(report, indent=2, allow_nan=False))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
