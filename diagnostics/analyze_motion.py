"""Summarize worn raw IMU data; host cues are not verified beat ground truth."""

import argparse
from collections import defaultdict
import csv
import json
import math
from pathlib import Path
import statistics

from read_serial import AXES


def percentile(values, fraction):
    ordered = sorted(values)
    if not ordered:
        return None
    position = (len(ordered) - 1) * fraction
    lower = int(position)
    upper = min(lower + 1, len(ordered) - 1)
    return ordered[lower] + (ordered[upper] - ordered[lower]) * (position - lower)


def analyze(recording):
    samples, cues, baseline = [], [], None
    with recording.open(encoding="utf-8", newline="") as source:
        for row in csv.DictReader(source):
            if row["type"] == "CALIBRATION":
                baseline = [float(v) for v in row["payload"].split(",")[1:7]]
            elif row["type"] == "HOST_CUE":
                cues.append({"host_s": float(row["host_elapsed_s"]), **json.loads(row["payload"])})
            elif row["type"] == "IMU":
                samples.append({"host_s": float(row["host_elapsed_s"]),
                                "device_ms": int(row["timestamp_ms"]),
                                "phase": row.get("phase", "unlabeled"),
                                "values": [float(row[axis]) for axis in AXES]})
    if baseline is None or not samples:
        raise ValueError("Recording needs calibration and valid IMU samples")
    gravity = math.sqrt(sum(v * v for v in baseline[:3]))
    groups = defaultdict(list)
    for sample in samples:
        gyro = [v - bias for v, bias in zip(sample["values"][3:], baseline[3:])]
        sample["gyro"] = gyro
        sample["gyro_mag"] = math.sqrt(sum(v * v for v in gyro))
        sample["dynamic_accel"] = abs(math.sqrt(sum(v * v for v in sample["values"][:3])) - gravity)
        sample["score"] = sample["dynamic_accel"] + 2 * sample["gyro_mag"]
        groups[sample["phase"]].append(sample)
    phases = {}
    for phase, group in groups.items():
        phases[phase] = {
            "samples": len(group),
            "gyro_mag_p95_rad_s": percentile([s["gyro_mag"] for s in group], .95),
            "score_p95": percentile([s["score"] for s in group], .95),
            "score_max": max(s["score"] for s in group),
        }
    directions = {}
    for axis in range(3):
        peaks = {"down": [], "return": []}
        for i, cue in enumerate(cues):
            if cue["phase"] not in peaks:
                continue
            end = min(cue["host_s"] + 1.3, cues[i + 1]["host_s"] - .05) if i + 1 < len(cues) else cue["host_s"] + 1.3
            window = [s["gyro"][axis] for s in samples if cue["host_s"] + .08 <= s["host_s"] < end]
            if window:
                peaks[cue["phase"]].append(max(window, key=abs))
        down, back = peaks["down"], peaks["return"]
        directions[AXES[axis + 3]] = {
            "down_peaks_rad_s": down, "return_peaks_rad_s": back,
            "down_median_rad_s": statistics.median(down) if down else None,
            "return_median_rad_s": statistics.median(back) if back else None,
            "opposite_sign_pairs": sum(a * b < 0 for a, b in zip(down, back)),
            "pairs": min(len(down), len(back)),
        }
    summary = {"recording": str(recording.resolve()), "hand": "right",
               "orientation": "unknown", "calibration": dict(zip(AXES, baseline)),
               "gravity_reference_m_s2": gravity, "phases": phases,
               "cued_direction_windows": directions,
               "score_definition": "abs(|accel|-|calibrated_accel|) + 2*|gyro-bias|",
               "interpretation": "Cue windows include human reaction delay. No observed beat annotations or beat-accuracy measurement."}
    return summary, samples, cues


def plot_motion(path, samples, cues, beats=None):
    import matplotlib
    matplotlib.use("Agg")
    import matplotlib.pyplot as plt
    figure, axes = plt.subplots(4, 1, figsize=(15, 9), sharex=True, constrained_layout=True)
    times = [sample["host_s"] for sample in samples]
    for index, ax in enumerate(axes[:3]):
        ax.plot(times, [s["gyro"][index] for s in samples], linewidth=.65)
        ax.set_ylabel(f"{AXES[index + 3]} (rad/s)")
    axes[3].plot(times, [s["score"] for s in samples], linewidth=.65, color="#a13b00")
    axes[3].set_ylabel("Motion score")
    axes[3].set_xlabel("Host elapsed time (s)")
    colors = {"down": "#bbdefb", "return": "#ffe0b2", "tempo_60": "#c8e6c9", "tempo_90": "#e1bee7", "tempo_120": "#ffcdd2"}
    for i, cue in enumerate(cues[:-1]):
        if cue["phase"] in colors:
            for ax in axes:
                ax.axvspan(cue["host_s"], cues[i + 1]["host_s"], color=colors[cue["phase"]], alpha=.4)
            if cue["index"] == 1:
                axes[0].text(cue["host_s"], .96, cue["phase"], transform=axes[0].get_xaxis_transform(), va="top", fontsize=9)
    for ax in axes:
        ax.grid(alpha=.2)
    if beats:
        matched = [b for b in beats if b["host_s"] is not None]
        axes[0].scatter([b["host_s"] for b in matched], [b["gyro"][0] for b in matched],
                        color="black", marker="x", s=20, zorder=4, label="BEAT peak")
        axes[3].scatter([b["host_s"] for b in matched], [b["score"] for b in matched],
                        color="black", marker="x", s=20, zorder=4)
        axes[0].legend(loc="upper right")
    figure.suptitle("Right-hand worn capture: gyro bias removed; shading denotes host instructions")
    figure.savefig(path, dpi=150)
    plt.close(figure)


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("recording", type=Path)
    parser.add_argument("--plot", action="store_true", help="Write PNG using installed matplotlib")
    args = parser.parse_args()
    report_path = args.recording.with_suffix(".motion.json")
    plot_path = args.recording.with_suffix(".motion.png")
    if report_path.exists() or (args.plot and plot_path.exists()):
        parser.error("Analysis output already exists; use a fresh recording")
    try:
        report, samples, cues = analyze(args.recording)
    except (OSError, ValueError, KeyError) as exc:
        parser.error(str(exc))
    with report_path.open("x", encoding="utf-8") as output:
        json.dump(report, output, indent=2, allow_nan=False)
    if args.plot:
        plot_motion(plot_path, samples, cues)
    print(json.dumps(report, indent=2, allow_nan=False))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
