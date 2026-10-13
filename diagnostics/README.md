# Python Diagnostics

These optional tools inspect Arduino telemetry, capture recordings and replay
stroke detection. They are not a server or a bridge for the frontend. The browser
connects directly to the Arduino through Web Serial and handles music and camera
tracking itself. Follow the [main README](../README.md) to run the app; Conda is
only needed if you choose to use these Python tools.

## Environment

The existing `infosci201-physical` Conda environment can be reused. Activate it
without recreating it:

```powershell
conda activate infosci201-physical
```

If that environment does not exist, run these commands from the repository root:

```powershell
conda env create -f environment.yml
conda activate infosci201-physical
```

The [environment file](../environment.yml) specifies Python 3.11 and pyserial 3.5.
Plots additionally require matplotlib (`python -m pip install matplotlib`).
Native detector replay and native tests require `g++` on PATH; replay compiles the
same C++ detector used by the firmware. Native tests are skipped if `g++` is absent.

## Usage

Run commands below from the repository root with the environment activated.
Inspect options without opening a device:

```powershell
python diagnostics/read_serial.py --help
```

Before capturing, use Arduino IDE to upload `arduino/AirConductor/AirConductor.ino`.
Confirm the Arduino's current serial port, disconnect it in the browser and close
any Serial Monitor. Only one application can use the port at a time. `COM3` below
is an example; replace it with the current port. Keep the sensor still during
calibration.

```powershell
python diagnostics/read_serial.py --port COM3 --calibrate --require-ready --duration 20
```

This captures telemetry and calibration events. Add `--detect` when you want
firmware BEAT events as well. Guided options play movement cues; start them only
when the wearer is ready. Opening the serial port may reset the Uno, so recalibrate
before returning to Conduct mode in the browser.

The current sketch also reports `CAPS,MOTION,1` and, while detection is active,
`MOTION,1,STILL,timestamp` / `MOTION,1,MOVING,timestamp` on state transitions.
Captures preserve these events and device timestamps. Corona requires this motion
support; a missing BEAT alone is not a stillness signal. Its initial thresholds
need checking with the worn sensor. Enable the optional Corona control in the app
only when you are ready to compare it. Returning to older firmware-dependent
behavior may require uploading that branch's sketch again.

To inspect a saved capture, replace `capture.csv` with its actual path:

```powershell
python diagnostics/analyze_motion.py recordings/capture.csv
python diagnostics/analyze_beats.py recordings/capture.csv
python diagnostics/replay_strokes.py recordings/capture.csv
```

Motion analysis and detector replay require raw IMU samples; beat analysis needs
BEAT events. Use `--plot` with either analyzer if matplotlib is installed.

## Tools and output

| Tool | Purpose |
| --- | --- |
| `read_serial.py` | Capture telemetry, calibration, device events and optional beats |
| `analyze_motion.py` | Summarize raw motion features and axis behavior |
| `analyze_beats.py` | Summarize beat timing, intervals and intensity |
| `replay_strokes.py` | Replay recorded IMU data through the firmware detector |
| `browser_guide.py` | Play Windows movement cues for an explicitly started browser test |
| `worn_guide.py` | Provide cue schedules used by guided serial captures |
| `native_runner.py` / `native/` | Compile and run the detector on the host |

Capture files default to `recordings/`; analyzers and replay write results beside
the input or at the requested output prefix. Recordings and generated reports
remain local and are ignored by Git. This README is explicitly retained with the
diagnostic source code.
