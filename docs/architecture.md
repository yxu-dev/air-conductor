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
- `experience.js`: Conduct/Listen modes, readiness gates, start rollback, immediate end, reset and device interruption.
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
- `visuals.js`: English studio, four-step setup, source controls, progress/gesture feedback and collapsible diagnostics.
- `motion-trail.js`: bounded presentation data for mirrored left-palm paths and sensor pulses. Points require fresh confirmed frames, break on tracking loss, invalid coordinates, label changes or gaps, and expire after one second.
- `motion-stage.js`: lazy-loaded Three.js renderer, luminous 3D orbits, particles, a GPU ribbon, live left-hand cursor and intensity-scaled sensor rings. Ambient motion follows the music tempo; only actual serial BEAT events create stroke pulses. Rendering does not change musical or hand-control state.
- `style.css` / `vite.config.js`: Tailwind CSS theme, utility-based components and official Vite integration; responsive layout, keyboard focus, fullscreen and reduced motion.

## Current scope

Stages A/B implement firmware sampling/calibration in `imu.h/.cpp`, a direction-gated stroke state machine in `stroke_detector.h/.cpp`, and Python capture, replay and beat analysis. READY means successful stationary sensor calibration; DETECT,ON independently enables beat output. Detection uses calibrated acceleration magnitude and gyro bias. Current right-hand mounting uses gx-negative gating, verified by a separate three-pair direction check; earlier records used gx-positive gating. Stationary calibration does not determine motion direction.

Stage C implements Web Serial, explicit calibration/detection controls, device-time BPM estimation and a live dashboard. Opening/BOOT waits for startup, sends DETECT,OFF and STREAM,OFF, then probes STATUS. Acknowledgements, not button clicks, establish active device state. Reconnect, reboot and recalibration invalidate tempo; a conducting pause retains the last estimate but starts a fresh interval history on resumption. Raw telemetry is optional and independent. Real Chrome connection, calibration and beat reception were checked; physical unplug/reconnect is still pending. Details in [browser tempo](browser-tempo.md).

Stage D loads the local two-voice, 16-bar MIDI and schedules note-on and note-off events by musical ticks on Tone Transport. Manual control is the default; conducting mode uses valid device-time estimates and holds tempo on idle/loss of detection. Pausing captures the audible tick, gates output and destroys queued voices; resuming preserves the paused Transport clock and restores held notes. Music is unlocked by an explicit play click. Note pitch is independent of BPM. See [music playback](music-playback.md).

Stage E requires an explicit camera button and a stable, user-confirmed physical-left hand before visual control. MediaPipe detects up to two hands; only the confirmed left-hand label is selected, using matching handedness/landmark/gesture indices. Camera restart clears binding. A classic Worker loads the local package IIFE/WASM/model and processes at most one frame at a time, capped at 20 FPS. Old results and frame gaps cannot accumulate gesture confirmations. Height control maps the smoothed left palm center to -30…-3 dB; manual mode retains its own saved setting. Left loss/ambiguity holds volume and clears the gesture candidate without switching to the right hand. Fists require confidence 0.65 and three fresh consecutive observations; palms require 0.55 and five. Gestures use the existing music session to pause/resume, never to initially start stopped audio. Physical controls, right-only exclusion, loss handling, camera restart and basic concurrent IMU/vision operation have passed participant checks. Evidence and its limits are recorded in [camera control](camera-control.md).

## Frontend development handoff

The core-control checkpoint is on `dev-1`; the product studio is implemented on `dev-2`. Conduct guides connection, calibration, camera access and left confirmation before one Start action. Listen requires only the local score. Starting unlocks audio directly from the click before serial awaits; failure rolls back detection. End silences immediately and stops detection, disconnecting if commands cannot finish. Reset also releases camera and binding. Device loss pauses audio and blocks gesture resume until a new explicit start; camera loss preserves volume-hold behavior. Active pause/resume retains source overrides. Mode changes require ending the performance.

The visual upgrade is on `dev-3`, using Tailwind CSS 4.3.3 and Three.js 0.186.1. Aurora and Nocturne are presentation palettes. A user preference or system reduced-motion setting freezes ambient animation and suppresses trails/pulses while retaining the real hand cursor. WebGL initialization failure selects a static scene; context loss/recovery leaves audio available. Geometry, materials, textures, observers and listeners are released on disposal. Render scheduling pauses offscreen or in hidden documents and caps at roughly 30 FPS. Lightweight unlit materials avoid physical-lighting passes; pixel ratio is at most 1 and the framebuffer is bounded to 600,000 pixels. The scene is a separate lazy chunk, about 141 kB gzip; music/UI initialization does not wait for it.

`style-readiness.js` verifies the actual compiled grid style before mounting the studio. An already-running Vite process can miss a newly created plugin configuration and serve raw Tailwind directives. The startup guard prevents unstyled canvases/oversized SVGs and displays a bounded recovery message. Icons also have explicit width/height attributes. `check:live` validates the actual dev service rather than only fresh isolated test services. System motion preference is refreshed by the UI lifecycle even when the stage is offscreen.

Camera settings auto-open for binding; successful start closes them and brings the studio into view. Permission and runtime errors remain recoverable. Firmware, stroke parameters, tempo estimation, musical scheduling and classification thresholds are unchanged. The optional gesture gate prevents an interrupted performance from resuming through an open palm.

Headless checks cover actual Listen audio, pause/resume position, rewind, keyboard sliders, unsupported Web Serial, denied camera access, selectable snapshots, CSV download and narrow layouts. Accessibility audits cover both modes with settings/diagnostics expanded. These checks do not claim physical validation of the newly combined Start/End UI; earlier participant results still describe core controls. No new participant session was started.

The final user interface and repository README must be in English. Development records may keep their existing language and remain available for now. Track and upload all recordings and associated metadata on development branches, alongside the existing documentation. Browser exports from `Final/tmp` are archived under `recordings/browser/`.

At the user's explicit final release request, remove the entire `docs/` and `recordings/` directories from the release tree and add `/docs/` and `/recordings/` to the release `.gitignore`. Ignore rules alone do not remove already tracked files. Preserve the complete commit history and the development branches; do not rewrite their history. The final tree contains application code, required runtime assets and one short English README, without other standalone development documents. Include operating instructions and required attribution in the README. Do not modify the proposal.

Complete and validate one feature, commit it, then proceed to the next. Participant testing requires an advance report and an explicit start from the user. The user declined additional crossing/occlusion tests; they are deferred and do not block frontend development.

The current [implementation-flow archive](implementation-flow.md) preserves the updated workspace document in this repository's history. Its original remains outside this repository at `Final/Air_Conductor_完整实现流程.md`; neither copy is required by the running app.
