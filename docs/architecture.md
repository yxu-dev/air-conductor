# Architecture

## Runtime

```text
MPU6050 → Arduino stroke detector → USB Serial → browser tempo estimator
                                                   ↓
Local MIDI → musical tick scheduler → Tone.js synth → speakers

Webcam → classic Worker / MediaPipe → confirmed physical LEFT hand
                                     ↓
                           palm height / held gesture → volume / pause / resume
RIGHT wrist Arduino beats → tempo / visual pulse
```

Python diagnostics run separately and never serve as the final runtime or a required bridge. All runtime assets live inside this repository.

## Responsibilities

- Arduino: fixed-interval sampling, explicit stationary calibration, stroke timestamps and intensity.
- `main.js`: user actions, module lifecycle and state updates.
- `state.js`: one representation of connection, calibration, camera and playback state.
- `serial.js`: Web Serial transport, ordered commands and stream/port cleanup.
- `protocol.js`: bounded ASCII line framing and strict protocol validation.
- `session.js`: boot handshake, calibration/detection acknowledgements, tempo lifecycle and event export.
- `tempo.js`: pure interval/BPM logic; no DOM or Tone.js dependencies.
- `audio.js`: local MIDI loading and the Tone backend (polyphony, volume, mute gate and limiter).
- `midi-score.js`: validated tick score, same-pitch overlap handling and loop/event boundaries.
- `music-player.js`: tick scheduling, note-offs, loop cleanup and pause/resume/stop.
- `music-session.js`: click-based audio unlock, loading/retry/cancellation, tempo source and UI music state.
- `vision.js`: camera permission/start/stop, single-frame Worker scheduling and lifecycle cleanup.
- `public/mediapipe/vision-worker.js`: local MediaPipe CPU inference in a classic Worker.
- `hand-control.js`: physical-left binding, handedness filtering, height smoothing, held gestures and loss handling.
- `visuals.js`: render state, stroke pulses, mirror camera preview and hand landmarks. A fading trail remains future work.

## Current scope

Stages A/B implement firmware sampling/calibration in `imu.h/.cpp`, a direction-gated stroke state machine in `stroke_detector.h/.cpp`, and Python capture, replay and beat analysis. READY means successful stationary sensor calibration; DETECT,ON independently enables beat output. Detection uses calibrated acceleration magnitude and gyro bias. Current right-hand mounting uses gx-negative gating, verified by a separate three-pair direction check; earlier records used gx-positive gating. Stationary calibration does not determine motion direction.

Stage C implements Web Serial, explicit calibration/detection controls, device-time BPM estimation and a live dashboard. Opening/BOOT waits for startup, sends DETECT,OFF and STREAM,OFF, then probes STATUS. Acknowledgements, not button clicks, establish active device state. Reconnect, reboot and recalibration invalidate tempo; a conducting pause retains the last estimate but starts a fresh interval history on resumption. Raw telemetry is optional and independent. Real Chrome connection, calibration and beat reception were checked; physical unplug/reconnect is still pending. Details in [browser tempo](browser-tempo.md).

Stage D loads the local two-voice, 16-bar MIDI and schedules note-on and note-off events by musical ticks on Tone Transport. Manual control is the default; conducting mode uses valid device-time estimates and holds tempo on idle/loss of detection. Pausing captures the audible tick, gates output and destroys queued voices; resuming preserves the paused Transport clock and restores held notes. Music is unlocked by an explicit play click. Note pitch is independent of BPM. See [music playback](music-playback.md).

Stage E requires an explicit camera button and a stable, user-confirmed physical-left hand before visual control. MediaPipe detects up to two hands; only the confirmed left-hand label is selected, using matching handedness/landmark/gesture indices. Camera restart clears binding. A classic Worker loads the local package IIFE/WASM/model and processes at most one frame at a time, capped at 20 FPS. Old results and frame gaps cannot accumulate gesture confirmations. Height control maps the smoothed left palm center to -30…-3 dB; manual mode retains its own saved setting. Left loss/ambiguity holds volume and clears the gesture candidate without switching to the right hand. Fists require confidence 0.65 and three fresh consecutive observations; palms require 0.55 and five. Gestures use the existing music session to pause/resume, never to initially start stopped audio. Physical controls, right-only exclusion, loss handling, camera restart and basic concurrent IMU/vision operation have passed participant checks. Evidence and its limits are recorded in [camera control](camera-control.md).

## Frontend development handoff

The core-control checkpoint is on `dev-1`; frontend and interaction development continues on `dev-2`. The next work covers guided setup, the presentation layout, fading left-hand trails, beat/intensity feedback, and clear pause/resume/end/reset behavior. Preserve the verified firmware, serial, tempo and audio contracts.

The final user interface and repository README must be in English. Development records may keep their existing language and remain available for now. At the user's explicit final cleanup request, remove development journals, validation logs and implementation-planning documents from the delivered tree; preserve their committed history. Keep concise operating instructions and required third-party attribution in the delivered project. Do not modify the proposal.

Complete and validate one feature, commit it, then proceed to the next. Participant testing requires an advance report and an explicit start from the user. The user declined additional crossing/occlusion tests; they are deferred and do not block frontend development.

The current [implementation-flow archive](implementation-flow.md) preserves the updated workspace document in this repository's history. Its original remains outside this repository at `Final/Air_Conductor_完整实现流程.md`; neither copy is required by the running app.
