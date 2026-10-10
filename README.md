# Air Conductor

Make music with motion. A right-wrist IMU gives the beat; webcam tracking of your left hand shapes volume and playback. The English studio uses Tailwind CSS and Three.js for a responsive interface, glowing orbits, hand trails and stroke pulses. Guided setup, fullscreen playback and a device-free Listen mode are included.

## Run

Requires Node.js and npm. From the repository root:

```powershell
cd web
npm ci
npm run dev -- --host 127.0.0.1 --port 5173 --strictPort
```

Open **http://127.0.0.1:5173/** in Chrome or Edge. Music, hand models, and tracking runtime are local. No Python service or Lab4 installation is needed.

## Play

Choose **Listen** for music with tempo and volume sliders, or **Conduct** for hand control:

1. Wear the right-wrist sensor in the verified orientation. Connect the Arduino by USB and select it with **Connect**.
2. Click **Calibrate**. Rest your right hand through the countdown and sampling period.
3. Enable the camera. Show only your left hand, then **Confirm** when tracking is stable.
4. Click **Start performance**. Right-hand downward strokes control tempo; lift to reset. Raise your left hand for louder music and lower it for softer music.
5. Hold a fist to pause; open your palm to resume. Buttons also control playback.

Pause preserves position; End stops detection and rewinds. Idle strokes retain tempo. Losing the left hand holds volume; restarting the camera requires confirmation again. **Reset devices** ends playback and releases both connections. Camera & session settings contain source overrides and CSV export; diagnostics are optional.

**Visual atmosphere** offers Aurora and Nocturne palettes and a reduced-motion option. System motion preferences are respected. The 3D scene loads separately; if WebGL is unavailable, a static view keeps the music and hand controls available.

## Hardware

Upload `arduino/AirConductor/AirConductor.ino` to Arduino Uno (`arduino:avr:uno`). Use Adafruit MPU6050, Unified Sensor, and BusIO libraries. I2C uses SDA/A4, SCL/A5, and GND; supply power appropriate to your breakout. Confirm the current port before upload and close any other serial monitor.

The tested module identifies as MPU6500 (`0x70` at `0x68`). Firmware also supports MPU6050. Current right-wrist mounting uses negative `gx` strokes; changing the mounting requires checking direction.

## Development

From `web/`: `npm test`, `npm run test:browser`, and `npm run test:production`. The last command builds and checks the production app. Browser checks use installed Chrome, muted headless playback, and separate ports (5174/5175); no physical device or camera is opened. `npm run preview` serves the production build.

Project code: MIT. Dependencies: MediaPipe (Apache-2.0); Three.js, Tailwind CSS, Tone.js and @tonejs/midi (MIT). The included project MIDI plays Beethoven’s *Ode to Joy*. Development asset provenance and verification records are archived on development branches.
