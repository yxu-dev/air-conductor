import { config } from './config.js';

export const state = {
  serialConnected: false,
  calibrationState: 'not-started',
  cameraReady: false,
  handTracked: false,
  audioReady: false,
  midiLoaded: false,
  playbackState: 'stopped',
  bpm: config.defaultBpm,
  volumeDb: -12,
  lastBeatReceivedAt: null,
  lastBeatIntensity: 0,
  gesture: 'None',
  palmX: null,
  palmY: null,
};
