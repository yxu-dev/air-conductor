import test from 'node:test';
import assert from 'node:assert/strict';
import { Experience, readiness } from '../src/experience.js';
import { createState } from '../src/state.js';

function fixture() {
  const state = createState();
  Object.assign(state, { serialPhase: 'connected', calibrationState: 'ready', cameraReady: true,
    leftHandBound: true, musicLoadState: 'ready' });
  const calls = [];
  const music = { setSource: source => { state.tempoSource = source; },
    play: async () => { calls.push('audio'); state.playbackState = 'playing'; },
    stop: () => { calls.push('stop'); state.playbackState = 'stopped'; },
    pause: () => { calls.push('pause'); state.playbackState = 'paused'; } };
  const session = { transport: { supported: true }, setDetection: async enabled => { calls.push(`detect:${enabled}`); state.detectionActive = enabled; },
    disconnect: async () => { calls.push('disconnect'); state.serialPhase = 'disconnected'; state.detectionActive = false; } };
  const control = { setVolumeSource: source => { state.volumeSource = source; }, setGestureControls: enabled => { state.gestureControlsEnabled = enabled; } };
  const vision = { stop: () => { calls.push('camera:off'); state.cameraReady = false; state.leftHandBound = false; } };
  const experience = new Experience({ state, session, music, control, vision });
  experience.setMode('conduct');
  return { state, calls, music, session, experience };
}

test('conducting readiness follows connection, calibration, camera and binding', () => {
  const state = createState(); state.musicLoadState = 'ready';
  assert.equal(readiness(state).step, 'connect');
  state.serialPhase = 'connected'; assert.equal(readiness(state).step, 'calibrate');
  state.calibrationState = 'ready'; assert.equal(readiness(state).step, 'camera');
  state.cameraReady = true; assert.equal(readiness(state).step, 'left');
  state.leftHandBound = true; assert.equal(readiness(state).ready, true);
  assert.equal(readiness(state, false).step, 'browser');
});

test('start unlocks audio before serial await and arms the conducting sources', async () => {
  const f = fixture(); await f.experience.start();
  assert.deepEqual(f.calls, ['audio', 'detect:true']);
  assert.equal(f.state.performanceActive, true);
  assert.equal(f.state.tempoSource, 'conducting');
  assert.equal(f.state.volumeSource, 'left-hand');
});

test('listen mode needs no hardware, never enables detection or gestures', async () => {
  const f = fixture(); f.state.serialPhase = 'disconnected'; f.state.cameraReady = false;
  f.experience.setMode('manual'); await f.experience.start();
  assert.deepEqual(f.calls, ['audio']);
  assert.equal(f.state.gestureControlsEnabled, false);
  assert.equal(f.state.volumeSource, 'manual');
  f.experience.setMode('conduct'); assert.equal(f.state.experienceMode, 'manual');
});

test('unready start cannot play music or enable detection', async () => {
  const f = fixture(); f.state.leftHandBound = false;
  await assert.rejects(f.experience.start(), /left hand/);
  assert.deepEqual(f.calls, []);
});

test('resume preserves the configured sources of an active performance', async () => {
  const f = fixture(); await f.experience.start();
  f.state.playbackState = 'paused'; f.state.tempoSource = 'manual'; f.state.volumeSource = 'manual';
  await f.experience.start();
  assert.equal(f.state.tempoSource, 'manual'); assert.equal(f.state.volumeSource, 'manual');
});

test('audio failure rolls back detection and exposes a recoverable error', async () => {
  const f = fixture(); f.music.play = async () => { throw new Error('audio unavailable'); };
  await assert.rejects(f.experience.start(), /audio unavailable/);
  assert.equal(f.state.detectionActive, false);
  assert.equal(f.state.performanceBusy, false);
  assert.equal(f.state.performanceActive, false);
});

test('end silences immediately and disconnects when detection cannot stop', async () => {
  const f = fixture(); f.state.detectionActive = true;
  f.session.setDetection = async () => { callsCheck(); throw new Error('timeout'); };
  function callsCheck() { assert.equal(f.calls[0], 'stop'); }
  await f.experience.end();
  assert.deepEqual(f.calls, ['stop', 'disconnect']);
  assert.equal(f.state.detectionActive, false);
});

test('end during pending start cannot allow late audio activation', async () => {
  const f = fixture(); let release;
  f.music.play = () => new Promise(resolve => { release = resolve; });
  const starting = f.experience.start();
  await f.experience.end(); release(); await starting;
  assert.equal(f.state.performanceActive, false);
  assert.equal(f.state.detectionActive, false);
  assert.equal(f.state.playbackState, 'stopped');
});

test('device loss pauses a performance; camera loss preserves established behavior', async () => {
  const f = fixture(); await f.experience.start();
  f.state.cameraReady = false; f.experience.tick();
  assert.equal(f.state.playbackState, 'playing');
  f.state.serialPhase = 'disconnected'; f.experience.tick();
  assert.equal(f.state.playbackState, 'paused');
  assert.equal(f.state.performanceActive, false);
  assert.match(f.state.performanceError, /device/);
});

test('reset closes camera and device and clears the left binding', async () => {
  const f = fixture(); await f.experience.reset();
  assert.deepEqual(f.calls, ['stop', 'camera:off', 'disconnect']);
  assert.equal(f.state.leftHandBound, false);
});
