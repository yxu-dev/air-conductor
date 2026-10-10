# Verification plan

## dev-3 Three.js and Tailwind CSS

- Tailwind CSS 4.3.3 is compiled through `@tailwindcss/vite`; component layouts and typography use its theme and utilities. Three.js 0.186.1 replaces the Canvas 2D stage with WebGL rendering. The firmware, tempo/audio algorithms and gesture thresholds are unchanged.
- All 68 Node checks pass, including bounded pulse intensity/expiry and breaks on rebound hand labels or invalid positions.
- All 15 muted headless Chrome checks pass. The ten existing product checks remain passing; five additions cover actual renderer theme switching and frozen reduced-motion frames, OS motion preference, WebGL context loss/recovery while playing, unavailable-WebGL fallback with real Listen audio, and synthetic frame/beat rendering plus GPU cleanup.
- The synthetic scene renders 66 trail indices and 11,650 triangles with WebGL error 0; disposal returns allocated geometry count to 0. This uses generated inputs, not participant data. `recordings/frontend/scene-checks.json` and `synthetic-motion.png` retain the result and rendered example. Desktop, mobile, playing and Nocturne screenshots were inspected.
- Production build and all seven built-app smoke checks pass: the prior five checks plus actual lazy-loaded Three.js initialization and theme/reduced-motion controls while real audio keeps playing. JSON reports are retained under `recordings/frontend/`.
- No physical camera, serial port or participant cue was opened. These checks validate presentation and regressions, not performance on every GPU or a new physical conducting session. Automatic Chrome playback was headless and muted on isolated ports 5174/5175.

## dev-2 product studio

- 66 Node checks pass: the existing 52 core checks plus performance readiness/lifecycle/rollback, preservation of sources, a gesture gate after interruption, and trail freshness/loss/expiry.
- Ten muted headless Chrome checks pass: English gated entry; real Listen playback/pause/resume/rewind; friendly permission-denied recovery; stable copyable snapshots and CSV download; 390 px layout; keyboard control without Web Serial; synthetic readiness/held-volume presentation; automated WCAG 2 A/AA + 2.1 AA audits in both modes with settings and diagnostics expanded; fullscreen enter/exit; and 320/768/1024 px layouts. This bounded automated audit does not claim complete accessibility conformance.
- Production build passes. `recordings/frontend/` contains desktop initial, real Listen playback and 390 px initial screenshots. No live device/camera data is captured. Synthetic state checks only UI readiness.
- Five production smoke checks pass against the built app on port 5175: silent/gated entry; local MIDI/model/Worker/WASM availability; real audio pause/resume position; end/rewind and mode unlock; no uncaught browser errors. Run `npm run test:production` to rebuild and check. JSON results are archived with browser checks in `recordings/frontend/`.
- Dedicated test service: port 5174. Installed Chrome is headless and muted; no serial port or physical camera is opened. Permission denial is simulated. No new participant tests or cues were started. The combined product Start/End flow can be experienced on the actual setup when the user requests it.


## Skeleton

- `cd web; npm ci; npm run build` checks the browser build and local asset copying.
- Python diagnostic `--help` works using the existing Conda interpreter.
- No hardware upload or gesture/beat accuracy claim is part of skeleton setup.

## Implementation milestones

1. Record stationary and worn IMU data; verify one intended stroke yields one beat, including return movements.
2. Check calibration, minimum/maximum stroke duration and reset after timeout.
3. Exercise tempo logic with clean beats, false short beats, missed beats, long gaps and Arduino restarts.
4. Change MIDI BPM manually without changing pitch; verify note endings, pause/resume and loop boundaries.
5. Combine serial and MIDI; measure response to sustained changes in conducting speed.
6. Check confirmed left-hand confidence/hold, loss and height-volume behavior while the right hand conducts; exclude right-hand visual controls.
7. Unplug/reconnect USB without page refresh; verify that stale timing history is cleared.
8. Build and run with network disconnected; use multiple participants for at least 10–15 minutes.

Numeric accuracy/latency targets will be frozen after baseline measurements. Native tests compile the actual firmware detector using the existing g++ compiler.

## Stage A checks

Completed bench results and hardware compatibility findings: [Stage A bench verification](stage-a-bench.md).

- Compile the exact `arduino/AirConductor` sketch for `arduino:avr:uno`; confirm COM3 before upload.
- `python -m unittest discover -s diagnostics/tests -v`: fragmented/corrupt frames, malformed/non-finite samples, clock wrap vs restart, gap and axis statistics.
- `python diagnostics/read_serial.py --port COM3 --calibrate --require-ready --duration 20`: bench initialization, six-axis stream, stationary reference and READY.
- Repeat with `--duration 305`: at least five minutes of telemetry after boot, no read error/reset, about 100 Hz; inspect invalid-frame counts and large sampling gaps.
- Query STATUS, toggle STREAM and repeat CALIBRATE on the same connection to verify command/state transitions. Check oversized/unknown command recovery.
- Confirm capture shutdown reports `stream_stopped=true` and `incomplete_final_frame=false`.
- Movement-based calibration rejection and worn downstroke/return-stroke data require a participant; bench stillness cannot establish those results.

## Worn capture completed

The initial right-hand capture and observed direction response are documented in [worn capture](worn-capture.md). Movement-based calibration rejection occurred, followed by successful stationary calibration and a complete guided capture.

## Stage B checks

- 16 tests cover serial samples/BEAT validation, cue timing, stillness/negative return, one stroke/peak timestamp/intensity, short spikes/stuck motion, low-energy and short strong rebound filtering, refractory suppression, sample gaps/restarts/invalid inputs, millis wrap and explicit reset. Eight tests compile the same C++ detector used by Uno; without g++ those tests are explicitly skipped.
- Replay the initial worn recording with `diagnostics/replay_strokes.py`: check quiet baseline and event/release timing; phase counts alone are not accuracy.
- Use `read_serial.py --port COM3 --validate-beats` for independent right-hand data after firmware upload; analyze with `analyze_beats.py --plot`.
- Check DETECT,ON is rejected before calibration; DETECT,OFF works independently of raw streaming; CALIBRATE stops detection and requires explicit re-enabling.
- Current implementation, parameters and hardware results: [stroke detection](stroke-detection.md).

## Stage C checks

- `cd web; npm test`: 25 passing tests. Serial tests use native Web Streams with a fake port, including fragmented frames, ordered writes, cancelled selection, unplug/read errors, pending-read cancellation, lock release and reconnection. Session tests cover boot/STATUS handshake, calibration gating/rejection/retry and stale beats across reset/recalibration.
- Tempo tests cover 60/90/120/150 BPM with variable receipt delay, short false events, isolated missed beats, sustained speed changes, pauses, unsigned clock wrap/restart, invalid inputs and a 12-peak fixture from the real Uno recording. Cue BPM is not ground truth for actual hand timing.
- `npm run build`: Vite production build and local MediaPipe asset synchronization passed.
- Real Chrome/Uno export confirms boot handshake, failed stationary calibration followed by successful retry, and continuous BEAT reception. A guided 60/90/120 BPM run produced 11/12/13 events within receipt windows with a one-second release allowance. Current-code replay ends at approximately 59.7/91.2/121.4 BPM. User confirmed stopping detection after exporting; the file lacks the final DETECT,OFF acknowledgement. After browser disconnect, CLI upload and Python capture successfully reused COM3. Physical unplug/reconnect still requires verification. This browser capture preceded the direction correction; no recognition accuracy is claimed.
- The real variable-speed 120 BPM cue segment exposed a tempo estimate stuck at the initial fast pace. A regression test now verifies that three same-direction deviating intervals within the five-interval window confirm change even with intervening normal variation. Production build and all 25 tests passed after this correction.
- Procedure and current scope: [browser tempo](browser-tempo.md).
- Current-mounting direction check after user reported upward-only beats: negative-gx firmware compiled/uploaded; a separate three-pair capture produced 3 down events, 0 returns and 0 idle events. C++ replay matches all three device peaks. Replaying with the old positive sign produces 3 return events. See [stroke detection](stroke-detection.md). Firmware/diagnostic tests now total 17; browser tests remain 25.

## Stage D checks

- Browser suite now totals 34 tests, including 9 music/serial integration tests; Node tests and production build passed. Serial/tempo tests from Stage C remain passing.
- The user confirmed audible manual tempo changes, and exposed an initial pause/resume restart. Fixed fractional-tick offsets by retaining the paused Transport clock. Tests now use Tone's actual time parser.
- User ran the local real-Web-Audio regression page in Chrome: all four cases passed (fixed-tempo pitch/note-off, change during sustained note, loop boundary and fractional-tick pause/resume). Stored result and scope: [music playback](music-playback.md).
- Current negative-gx device-to-music capture contains real BEAT-triggered music targets: the fast cue segment ranges from about 110.49 to 126.26 BPM. The slow segment's median recorded interval was 1,520 ms, below the configured 50 BPM minimum, so it retained 100 BPM. Cue counts are not confirmed motion counts. User reported audible but modest change, consistent with the actual target range. See [music playback](music-playback.md).
- User confirmed real main-page playback resumes from the paused position after the fix. The supplied CSV remains the first export, containing DETECT,OFF and a pause near the loop end, but no subsequent resume/STOP. The audible pause/resume result is user-reported; exact tick preservation is additionally covered by the real Web Audio test. Stopping hand motion while music keeps tempo was not separately confirmed; no speaker latency measurement is claimed.

## Stage E checks

- Browser suite now totals 46 passing tests. Twelve new tests cover stable single-hand binding, no control before confirmation, same-index left selection with changing array order, reversed input labels, right-hand exclusion, clamped/smoothed volume, saved manual volume, held fist/open lifecycle, confidence/ambiguity/loss/stall resets, no stopped-audio gesture start, camera cancellation/cleanup/retry and stale-frame rejection. Vision/music integration exports HOST_VISION alongside HOST_MUSIC.
- Production build passed (main JS about 322 kB, gzip about 86 kB). Local Worker/runtime/model/WASM are included; inference does not run on the main UI thread.
- User opened `/tests/vision-browser.html` in real Chrome: two checks passed. Local model/WASM loaded in about 379 ms; blank-image inference took about 95 ms and 22 ms. These are blank frames, not hand-tracking performance or accuracy. Result stored in `recordings/vision-runtime-20261005.json`.
- On 2026-10-10 the user confirmed real webcam access, left binding/tracking, height-volume numerical/audible changes, and fist pause. Open-palm resume was unreliable: playback stayed paused and no accepted open-palm label appeared. Export `Final/tmp/air-conductor-beats-2026-10-10-22-14-33.csv` contains five gesture pauses and one gesture resume with the preserved tick; raw classifier scores were unavailable. Right-hand exclusion, deliberate loss and camera restart remain pending.
- Compared with the working Lab4 implementation and initially aligned the two-gesture allowlist, 0.65 confidence threshold, and three distinct consecutive observations. Added raw classification/score diagnostics. Both model files have identical SHA256. All 49 Node tests and the production build passed at that stage. The user retested: resume triggered, but a strict open pose was needed and natural opening remained unreliable.
- Export `Final/tmp/air-conductor-beats-2026-10-10-22-30-01.csv` contains 26 vision-only events. Its last Open_Palm scores (0.627, 0.562, 0.617) were rejected at 0.65 without a coincident loss event. These are change logs, not all frames, and contain no music events. Adjusted only palm acceptance to 0.55 and five fresh consecutive results; fist stays at 0.65 and three. All 52 Node tests and the production build pass, including observed-score acceptance, rejected-score/loss resets and strict fist confidence. Added a fixed, copyable diagnostic snapshot with clipboard fallback. Actual gesture reliability, false triggers and clipboard behavior need participant verification; no new camera test was started automatically.
- Before participant tests, report the completed work and proposed actions, stop, and wait for the user to explicitly start the test. Do not start cues or timed movement tasks while the user may be away.
- After explicitly starting the next test, the user reported all three fist pauses and all three natural-palm resumes succeeded, with continuous playback position. This is a participant-reported pass for the three-cycle basic case. The page was refreshed before CSV export, so no exact music ticks or gesture scores are available for this run. No repeat was requested solely to recover logs. Right-hand exclusion, deliberate loss, camera restart and diagnostic clipboard behavior remain pending.
- Subsequent participant checks passed: right-only height/fist/palm movements left volume/playback unchanged and the left hand remained lost; camera close/reopen required a new left confirmation, and controls worked again after confirmation. Export `Final/tmp/air-conductor-beats-2026-10-10-23-11-28.csv` contains 402 events (186 vision, 216 music), eight gesture pause/resume pairs with exactly equal music ticks, and 18 lost intervals with zero volume/playback operations (longest 41.478 s). Two CAMERA_ON events and one CAMERA_OFF are present. The file ends at the second CAMERA_ON, so post-restart binding/control success is participant-reported, not verified by the CSV. Physical right-hand identity/action timing is also participant-reported. No Arduino events are present; IMU/vision concurrency, simultaneous hands/crossing and diagnostic clipboard behavior remain pending. This stage changed validation documentation only; the existing 52-test/build results remain applicable.

## IMU/vision concurrent participant check

- The user confirmed slow/fast right-hand strokes changed beat count and music tempo while left-hand volume basically held without unintended pause. With steady right-hand strokes, left-hand height controlled volume and fist/palm pause/resume worked from the paused position while tempo still followed the right hand.
- Export `Final/tmp/air-conductor-beats-2026-10-10-23-22-05.csv` contains 884 events: 116 BEAT, 239 HOST_VISION, 516 HOST_MUSIC and 13 other device events. Calibration/READY, left binding, conducting tempo source, left-hand volume source and final DETECT,OFF are present. No device ERROR events are recorded.
- 65 tempo events span about 62.923–137.240 BPM; 424 volume updates span -30…-5.633 dB. Twelve of thirteen pauses have matching resumes, with exactly equal music ticks. Three resumed pause intervals received one BEAT each, including two with tempo updates; paused volume updates are zero in all twelve. The final pause has no resume before export and is not counted as a successful recovery pair.
- This validates basic concurrent operation, not beat accuracy, speaker latency or quantified isolation. The pre-first-pause detection window has about 5.52 dB volume variation, and no frame-level hand-position record distinguishes physical movement from tracking jitter. Simultaneous visible hands/crossing, quantified volume stability and clipboard behavior remain pending. Documentation-only changes use the existing 52-test/build results; participant actions were explicitly requested before execution.
