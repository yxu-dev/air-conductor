"""Capture MPU6050/MPU6500 telemetry and protocol events without a browser."""

import argparse
from collections import Counter
import csv
from datetime import datetime, timezone
import json
import math
from pathlib import Path
import time

import serial

ROOT = Path(__file__).resolve().parents[1]
AXES = ("ax", "ay", "az", "gx", "gy", "gz")
FIELDS = ("received_utc", "host_elapsed_s", "type", "timestamp_ms", *AXES, "intensity", "payload")
GUIDED_FIELDS = (*FIELDS, "phase", "cue_index")


def parse_imu(line: str) -> tuple[int, tuple[float, ...]]:
    parts = line.split(",")
    if len(parts) != 8 or parts[0] != "IMU":
        raise ValueError("Expected IMU,timestamp,ax,ay,az,gx,gy,gz")
    timestamp = int(parts[1])
    values = tuple(float(value) for value in parts[2:])
    if not 0 <= timestamp < 2**32 or not all(math.isfinite(v) for v in values):
        raise ValueError("Invalid timestamp or non-finite sensor value")
    return timestamp, values


def parse_beat(line: str) -> tuple[int, float]:
    parts = line.split(",")
    if len(parts) != 3 or parts[0] != "BEAT":
        raise ValueError("Expected BEAT,timestamp,intensity")
    timestamp, intensity = int(parts[1]), float(parts[2])
    if not 0 <= timestamp < 2**32 or not math.isfinite(intensity) or not 0 <= intensity <= 1:
        raise ValueError("Invalid beat timestamp or intensity")
    return timestamp, intensity


class LineBuffer:
    """Reassemble fragmented lines and discard overlong frames through newline."""

    def __init__(self, limit: int = 512):
        self.limit = limit
        self.buffer = bytearray()
        self.discarding = False
        self.invalid = 0

    def feed(self, chunk: bytes) -> list[str]:
        lines = []
        for byte in chunk:
            if byte == 10:
                if not self.discarding:
                    try:
                        line = self.buffer.decode("ascii").rstrip("\r")
                        if line:
                            lines.append(line)
                    except UnicodeDecodeError:
                        self.invalid += 1
                self.buffer.clear()
                self.discarding = False
            elif not self.discarding:
                self.buffer.append(byte)
                if len(self.buffer) > self.limit:
                    self.invalid += 1
                    self.discarding = True
                    self.buffer.clear()
        return lines


class CaptureStats:
    def __init__(self):
        self.samples = 0
        self.previous_timestamp = None
        self.intervals = []
        self.resets = 0
        self.means = [0.0] * 6
        self.m2 = [0.0] * 6
        self.minimum = [math.inf] * 6
        self.maximum = [-math.inf] * 6

    def add(self, timestamp: int, values: tuple[float, ...]) -> None:
        if self.previous_timestamp is not None:
            dt = (timestamp - self.previous_timestamp) % 2**32
            if dt >= 2**31:
                self.resets += 1
            else:
                self.intervals.append(dt)
        self.previous_timestamp = timestamp
        self.samples += 1
        for i, value in enumerate(values):
            delta = value - self.means[i]
            self.means[i] += delta / self.samples
            self.m2[i] += delta * (value - self.means[i])
            self.minimum[i] = min(self.minimum[i], value)
            self.maximum[i] = max(self.maximum[i], value)

    def summary(self) -> dict:
        elapsed = sum(self.intervals)
        return {
            "imu_samples": self.samples,
            "device_rate_hz": 1000 * len(self.intervals) / elapsed if elapsed else None,
            "device_timestamp_resets": self.resets,
            "duplicate_timestamps": self.intervals.count(0),
            "max_interval_ms": max(self.intervals, default=None),
            "intervals_over_30ms": sum(dt > 30 for dt in self.intervals),
            "axes": {
                name: {
                    "mean": self.means[i],
                    "std": math.sqrt(max(0.0, self.m2[i] / (self.samples - 1)))
                    if self.samples > 1 else None,
                    "min": self.minimum[i] if self.samples else None,
                    "max": self.maximum[i] if self.samples else None,
                } for i, name in enumerate(AXES)
            },
        }


def capture(args: argparse.Namespace) -> int:
    output = args.output.resolve()
    output.parent.mkdir(parents=True, exist_ok=True)
    stats = CaptureStats()
    counts = Counter()
    frames = LineBuffer()
    ready = False
    commands_sent = False
    problem = None
    exit_code = 0
    created = False
    started = time.monotonic()
    calibration = None
    stream_stopped = False
    detection_requested = False
    detector_started = False
    detector_stopped = False
    beat_count = 0
    guide = None
    audio = None
    if args.guided:
        from worn_guide import AudioCues, Guide
        guide = Guide(validation=args.validate_beats, focus60=args.check_60, direction_check=args.direction_check)
        audio = AudioCues()
        audio.speak(f"Keep your right hand still. Calibration will begin after {args.boot_wait:g} seconds.")
    next_report = started + 5
    try:
        # Opening Uno usually resets it; do not discard its startup messages.
        with serial.Serial(args.port, args.baud, timeout=0.2, write_timeout=1) as port:
            with output.open("x", encoding="utf-8", newline="") as recording:
                created = True
                writer = csv.DictWriter(recording, fieldnames=GUIDED_FIELDS if guide else FIELDS)
                writer.writeheader()
                print(f"Connected to {args.port}; recording {output}", flush=True)

                def consume(chunk: bytes) -> bool:
                    nonlocal ready, calibration, problem, exit_code
                    nonlocal detection_requested, detector_started, detector_stopped, beat_count
                    stopped = False
                    for line in frames.feed(chunk):
                        kind = line.split(",", 1)[0]
                        counts[kind] += 1
                        row = {
                            "received_utc": datetime.now(timezone.utc).isoformat(),
                            "host_elapsed_s": f"{time.monotonic() - started:.6f}",
                            "type": kind,
                            "payload": line,
                        }
                        if guide:
                            row.update(phase=guide.phase, cue_index=guide.index)
                        if kind == "IMU":
                            try:
                                timestamp, values = parse_imu(line)
                            except ValueError:
                                counts["INVALID_IMU"] += 1
                                row["type"] = "INVALID_IMU"
                            else:
                                stats.add(timestamp, values)
                                row.update(zip(AXES, values))
                                row["timestamp_ms"] = timestamp
                        else:
                            print(line, flush=True)
                            if kind == "BEAT":
                                try:
                                    timestamp, intensity = parse_beat(line)
                                except ValueError:
                                    counts["INVALID_BEAT"] += 1
                                    row["type"] = "INVALID_BEAT"
                                else:
                                    row.update(timestamp_ms=timestamp, intensity=intensity)
                                    beat_count += 1
                            stopped = stopped or line == "STREAM,OFF"
                            if line == "DETECT,ON":
                                detector_started = True
                                detector_stopped = False
                                if guide and guide.started is None:
                                    guide.start(time.monotonic())
                            elif line == "DETECT,OFF":
                                detector_stopped = True
                            if line in ("READY", "STATUS,READY"):
                                ready = True
                                if args.detect and not detection_requested:
                                    port.write(b"DETECT,ON\n")
                                    detection_requested = True
                                if guide and guide.started is None and not args.detect:
                                    guide.start(time.monotonic())
                            elif line.startswith("CALIBRATION,"):
                                calibration = line
                            elif line.startswith("BOOT,") or line in (
                                "STATUS,CALIBRATING", "STATUS,UNCALIBRATED", "STATUS,SENSOR_ERROR"
                            ):
                                ready = False
                                if guide and guide.started is not None:
                                    problem = "Device lost calibration during guided capture"
                                    exit_code = 1
                            if kind == "ERROR":
                                ready = False
                                problem = line
                                exit_code = 1
                        writer.writerow(row)
                    return stopped

                try:
                    while time.monotonic() - started < args.duration:
                        now = time.monotonic()
                        if guide:
                            # Queued samples retain the preceding host phase.
                            if port.in_waiting:
                                consume(port.read(min(port.in_waiting, 4096)))
                            for event in guide.poll(now):
                                guide.phase, guide.index = event["phase"], event["index"]
                                print(f"CUE {event['phase']} {event['index']} {event['instruction']}", flush=True)
                                writer.writerow({
                                    "received_utc": datetime.now(timezone.utc).isoformat(),
                                    "host_elapsed_s": f"{time.monotonic() - started:.6f}",
                                    "type": "HOST_CUE", "payload": json.dumps(event),
                                    "phase": event["phase"], "cue_index": event["index"],
                                })
                                counts["HOST_CUE"] += 1
                                audio.play(event)
                            if guide.done:
                                break
                        if not commands_sent and now - started >= args.boot_wait:
                            commands = ["STATUS", "STREAM,ON"]
                            if args.calibrate:
                                commands.append("CALIBRATE")
                                print("Calibration requested: keep the sensor still for 2.5 s.", flush=True)
                            for command in commands:
                                port.write((command + "\n").encode("ascii"))
                            commands_sent = True
                        chunk = port.read(max(1, min(port.in_waiting, 4096)))
                        consume(chunk)
                        if now >= next_report:
                            recording.flush()
                            print(f"{now - started:.0f}s: {stats.samples} IMU samples, {beat_count} beats, ready={ready}", flush=True)
                            next_report = now + 5
                        if problem:
                            break
                finally:
                    try:
                        if args.detect:
                            port.write(b"DETECT,OFF\n")
                        port.write(b"STREAM,OFF\n")
                        # Complete queued frames before closing the port/CSV.
                        stop_deadline = time.monotonic() + 1
                        while not stream_stopped and time.monotonic() < stop_deadline:
                            stream_stopped = consume(port.read(max(1, min(port.in_waiting, 4096))))
                        if not stream_stopped:
                            problem = problem or "No STREAM,OFF acknowledgement"
                            exit_code = exit_code or 1
                    except (serial.SerialException, OSError):
                        problem = problem or "Failed to stop serial stream"
                        exit_code = exit_code or 1
    except KeyboardInterrupt:
        problem = "Interrupted by user"
        exit_code = 130
    except (serial.SerialException, OSError, RuntimeError) as exc:
        problem = str(exc)
        exit_code = 1
    finally:
        if audio:
            audio.close()
    if not stats.samples or (args.require_ready and not ready):
        exit_code = exit_code or 1
        problem = problem or "No IMU samples or calibration did not reach READY"
    if guide and (not guide.done or guide.timing_missed):
        exit_code = exit_code or 1
        problem = problem or "Guided capture incomplete or cue timing missed"
    if args.detect and (not detector_started or not detector_stopped):
        exit_code = exit_code or 1
        problem = problem or "Detector start/stop acknowledgement missing"
    summary = {
        "port": args.port,
        "baud": args.baud,
        "recording": str(output),
        "duration_s": time.monotonic() - started,
        "ready": ready,
        "calibration": calibration,
        "stream_stopped": stream_stopped,
        "detector_started": detector_started,
        "detector_stopped": detector_stopped,
        "beat_count": beat_count,
        "events": dict(counts),
        "invalid_frames": frames.invalid,
        "incomplete_final_frame": bool(frames.buffer) or frames.discarding,
        "error": problem,
        **stats.summary(),
    }
    if guide:
        summary["guide"] = {"hand": "right", "orientation": "unknown",
                            "completed": guide.done, "timing_missed": guide.timing_missed,
                            "labels": "host instructions, not verified movement ground truth",
                            "events": guide.events}
    if created:
        with output.with_suffix(".summary.json").open("x", encoding="utf-8") as report:
            json.dump(summary, report, ensure_ascii=False, indent=2, allow_nan=False)
    display = dict(summary)
    if guide:
        display["guide"] = {k: v for k, v in summary["guide"].items() if k != "events"}
        display["guide"]["cue_count"] = len(guide.events)
    print(json.dumps(display, ensure_ascii=False, indent=2, allow_nan=False), flush=True)
    return exit_code


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--port", required=True, help="Confirmed Arduino port, e.g. COM3")
    parser.add_argument("--baud", type=int, default=115200)
    parser.add_argument("--duration", type=float, default=None, help="Total seconds; defaults: 20 ordinary, 130 guided, 155 beat validation")
    parser.add_argument("--boot-wait", type=float, default=None, help="Wait for Uno reset; default 2, or 10 for --guided")
    parser.add_argument("--calibrate", action="store_true", help="Request stationary calibration")
    parser.add_argument("--require-ready", action="store_true", help="Fail if no successful calibration")
    parser.add_argument("--guided", action="store_true", help="Right-hand worn capture with local voice/tone cues (Windows)")
    parser.add_argument("--detect", action="store_true", help="Calibrate, then enable firmware BEAT output")
    validation_group = parser.add_mutually_exclusive_group()
    validation_group.add_argument("--validate-beats", action="store_true", help="Guided 10 isolated strokes plus 60/90/120 BPM; enables detection")
    validation_group.add_argument("--check-60", action="store_true", help="Short independent 12-tone 60 BPM retest; enables detection")
    validation_group.add_argument("--direction-check", action="store_true", help="Three separated down/up pairs to verify current mounting; enables detection")
    default_name = datetime.now().astimezone().strftime("imu-%Y%m%d-%H%M%S-%f.csv")
    parser.add_argument("--output", type=Path, default=ROOT / "recordings" / default_name)
    args = parser.parse_args()
    if args.validate_beats or args.check_60 or args.direction_check:
        args.guided = args.detect = True
    args.duration = args.duration if args.duration is not None else (65 if args.check_60 or args.direction_check else 155 if args.validate_beats else 130 if args.guided else 20)
    args.boot_wait = args.boot_wait if args.boot_wait is not None else (10 if args.guided else 2)
    if args.guided or args.detect:
        args.calibrate = args.require_ready = True
    if not math.isfinite(args.duration) or not math.isfinite(args.boot_wait) or args.boot_wait < 0 or args.duration <= args.boot_wait + 3:
        parser.error("duration must be finite and exceed boot-wait + 3 seconds; boot-wait must be nonnegative")
    if args.baud <= 0:
        parser.error("baud must be positive")
    if args.output.exists() or args.output.with_suffix(".summary.json").exists():
        parser.error("output or summary already exists; choose a new filename")
    return capture(args)


if __name__ == "__main__":
    raise SystemExit(main())
