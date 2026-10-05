# Architecture

## Runtime

```text
MPU6050 → Arduino stroke detector → USB Serial → browser tempo estimator
                                                   ↓
Local MIDI → musical tick scheduler → Tone.js synth → speakers

Webcam → MediaPipe → palm height / held gesture → volume / pause / resume
Arduino beats + camera palm position → visual pulse / trail
```

Python diagnostics run separately and never serve as the final runtime or a required bridge. All runtime assets live inside this repository.

## Responsibilities

- Arduino: fixed-interval sampling, explicit stationary calibration, stroke timestamps and intensity.
- `main.js`: user actions, module lifecycle and state updates.
- `state.js`: one representation of connection, calibration, camera and playback state.
- `serial.js`: transport, validation, commands and cleanup.
- `tempo.js`: pure interval/BPM logic; no DOM or Tone.js dependencies.
- `audio.js`: local MIDI, musical scheduling, gain and playback lifecycle.
- `vision.js`: camera inference, gesture stability and palm position.
- `visuals.js`: render state, stroke pulses and hand trails.

## Current scope

Modules are scaffolds. Only the initial status page is implemented. Add working behavior one subsystem at a time; do not report READY before calibration completes.
