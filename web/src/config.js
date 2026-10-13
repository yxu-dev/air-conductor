export const responseProfiles = Object.freeze({
  classic: Object.freeze({
    tempoWindow: 5, tempoSmoothing: 0.35, tempoChangeIntervals: 3,
    tempoTolerance: 0.25, tempoConsecutiveChanges: false, tempoRampSeconds: 0.2,
    palmSmoothingMs: 220, volumeUpdateMs: 100,
  }),
  responsive: Object.freeze({
    tempoWindow: 3, tempoSmoothing: 0.65, tempoChangeIntervals: 2,
    tempoTolerance: 0.20, tempoConsecutiveChanges: true, tempoRampSeconds: 0.08,
    // Apply each fresh inference frame (at most 20 FPS), keeping the dB deadzone.
    palmSmoothingMs: 120, volumeUpdateMs: 0,
  }),
});

export const config = Object.freeze({
  defaultResponseProfile: 'responsive',
  defaultSoundProfile: 'ensemble',
  ...responseProfiles.responsive,
  serialBaudRate: 115200,
  minBpm: 50,
  maxBpm: 180,
  defaultBpm: 100,
  beatIdleMs: 2500,
  serialStartupMs: 2000,
  calibrationPreparationMs: 5000,
  defaultVolumeDb: -18,
  minVolumeDb: -36,
  maxVolumeDb: 0,
  gestureStableResults: 3,
  handConfidence: 0.7,
  gestureConfidence: 0.65,
  openPalmConfidence: 0.55,
  openPalmStableResults: 5,
  handBindingMs: 700,
  visionMaxGapMs: 250,
  handLostMs: 500,
  visionFps: 20,
  cameraTop: 0.2,
  cameraBottom: 0.8,
  gestureMaxVolumeDb: -3,
  gestureMinVolumeDb: -30,
  visionWorkerUrl: '/mediapipe/vision-worker.js',
  midiUrl: '/midi/ode.mid',
  midiTitle: 'Ode to Joy',
  gestureModelUrl: '/models/gesture_recognizer.task',
  visionWasmUrl: '/mediapipe/wasm',
});

export function responseSettings(name = config.defaultResponseProfile) {
  if (!Object.hasOwn(responseProfiles, name)) throw new Error('Unknown control response.');
  return responseProfiles[name];
}
