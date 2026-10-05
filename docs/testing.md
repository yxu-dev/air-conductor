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
6. Check gesture confidence/hold, hand loss and height-volume behavior during normal strokes.
7. Unplug/reconnect USB without page refresh; verify that stale timing history is cleared.
8. Build and run with network disconnected; use multiple participants for at least 10–15 minutes.

Numeric accuracy/latency targets will be frozen after baseline measurements. No detector tests are implemented yet.
