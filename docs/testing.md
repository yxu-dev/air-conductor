# Verification plan

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
- Actual webcam access, physical-left binding, height/volume listening, held fist/open, right-hand exclusion, hand loss and camera restart remain pending. Before participant tests, report the completed work and proposed actions, stop, and wait for the user to explicitly start the test. Do not start cues or timed movement tasks while the user may be away.
