export const config = Object.freeze({
  serialBaudRate: 115200,
  minBpm: 50,
  maxBpm: 180,
  defaultBpm: 100,
  gestureHoldMs: 500,
  midiUrl: '/midi/ode.mid',
  gestureModelUrl: '/models/gesture_recognizer.task',
  visionWasmUrl: '/mediapipe/wasm',
});
