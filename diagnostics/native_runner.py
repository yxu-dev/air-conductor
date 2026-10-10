"""Compile the firmware detector for host tests/replays using an existing g++."""

from contextlib import contextmanager
from pathlib import Path
import shutil
import subprocess
import tempfile

ROOT = Path(__file__).resolve().parents[1]


@contextmanager
def compiled_detector():
    compiler = shutil.which("g++")
    if not compiler:
        raise RuntimeError("Native detector tests/replay require an existing g++ compiler")
    with tempfile.TemporaryDirectory(prefix="air-conductor-detector-") as temporary:
        executable = Path(temporary) / "stroke_runner.exe"
        firmware = ROOT / "arduino" / "AirConductor"
        subprocess.run([compiler, "-std=c++11", "-O2", "-Wall", "-Wextra", "-Werror", "-pedantic",
                        "-I", str(firmware), str(firmware / "stroke_detector.cpp"),
                        str(ROOT / "diagnostics" / "native" / "stroke_runner.cpp"),
                        "-o", str(executable)], check=True, capture_output=True, text=True, timeout=60)
        yield executable


def run_detector(executable, samples):
    lines = ["RESET" if sample is None else f"S,{sample[0]},{sample[1]},{sample[2]}" for sample in samples]
    result = subprocess.run([str(executable)], input="\n".join(lines) + "\n",
                            capture_output=True, text=True, check=True, timeout=10)
    beats = []
    for line in result.stdout.splitlines():
        _, timestamp, intensity, emitted = line.split(",")
        beats.append({"timestamp_ms": int(timestamp), "intensity": float(intensity),
                      "emitted_ms": int(emitted),
                      "release_delay_ms": (int(emitted) - int(timestamp)) % 2**32})
    return beats
