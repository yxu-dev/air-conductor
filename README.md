# Air Conductor

A wearable music interface built with Arduino Uno, a wrist-mounted IMU, and a browser-based MIDI player.

- **Right hand:** downward conducting strokes control musical tempo. Stroke intensity drives visual pulses.
- **Left hand:** webcam tracking maps hand height to volume. A closed fist pauses playback; an open palm resumes from the paused position.
- **Browser:** plays a local, looping MIDI arrangement of *Ode to Joy*. Tempo changes preserve pitch.

The core controls and concurrent IMU/webcam operation have been checked on the physical setup. The final presentation interface, motion trails, and guided interaction flow are the next development phase. The final interface and this README use English.

## Run the browser app

Use Node.js and npm. From the repository root:

```powershell
cd web
npm ci
npm run dev -- --host 127.0.0.1 --port 5173 --strictPort
```

Open `http://127.0.0.1:5173/` in Chrome or another browser with Web Serial support. MIDI, gesture models, and MediaPipe runtime files are served locally. The app runs independently of Lab4 and does not require a Python service.

1. Wear the IMU on the right wrist using the verified mounting orientation.
2. Connect the Arduino in the browser and select its current serial port.
3. Run stationary calibration. Keep the right hand still through the preparation countdown and sampling period.
4. Enable the camera. Show only the left hand, then confirm it once tracking is stable.
5. Select conducting as the tempo source and left-hand height as the volume source.
6. Enable beat detection and click the music play control to unlock browser audio.
7. Conduct downward strokes with the right hand. Raise or lower the left hand to adjust volume; close and open it to pause and resume.

Pausing preserves the music position; stopping returns to the beginning. When strokes stop, music retains its last tempo. Losing the left hand holds volume. Restarting the camera requires a new left-hand confirmation. Manual tempo and volume controls are available for playback without the hardware.

## Hardware and firmware

The firmware entry point is `arduino/AirConductor/AirConductor.ino`. The board target is Arduino Uno (`arduino:avr:uno`). I2C uses SDA to A4, SCL to A5, and GND to GND; power the breakout according to its electrical requirements.

The tested module reports address `0x68` and identity `0x70` (MPU6500). Firmware supports this configuration alongside Adafruit MPU6050 devices. Current motion parameters use negative `gx` for the verified right-wrist orientation.

Required Arduino libraries: Adafruit MPU6050, Adafruit Unified Sensor, and Adafruit BusIO. In this workspace, use the bundled CLI at:

```text
D:\Program Files\Arduino IDE\resources\app\lib\backend\resources\arduino-cli.exe
```

Confirm the sketch and current port before uploading; the most recently used port is COM3. The browser and Arduino Serial Monitor cannot share an open serial port.

## Project layout

```text
arduino/AirConductor/   Firmware and stroke detector
web/                   Browser app, local assets, and tests
diagnostics/           Optional Python capture and analysis tools
docs/                  Development records and technical references
recordings/            Captures and analysis archived on development branches
environment.yml        Python diagnostic environment specification
```

## Development checks

From `web/`:

```powershell
npm test
npm run build
```

The current browser suite contains 52 passing tests. For optional Python diagnostics, reuse the existing Conda environment:

```powershell
conda activate infosci201-physical
python -m unittest discover -s diagnostics/tests -v
```

Development records remain available in [architecture](docs/architecture.md), [testing](docs/testing.md), [camera controls](docs/camera-control.md), and [music playback](docs/music-playback.md). Both `docs/` and `recordings/` are committed and uploaded on development branches. At release, remove these directories from the release tree and ignore them there; the complete development history stays in Git and on development branches. The final delivery contains code, required runtime assets, and one short English README, with required attribution included there. Current asset sources and licensing are recorded in [assets](docs/assets.md).
