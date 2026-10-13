import { config } from './config.js';
import { studioMarkup } from './studio-markup.js';
import { gestureRule } from './hand-control.js';
import { readiness } from './experience.js';

const views = new WeakMap();
const text = (el, value) => { if (el.textContent !== String(value)) el.textContent = value; };
const error = (el, message) => { el.hidden = !message; text(el, message ?? ''); };
const connections = { disconnected: 'Not connected', connecting: 'Choose a device', initializing: 'Starting device', connected: 'Connected', disconnecting: 'Disconnecting', unresponsive: 'No response' };
const calibrations = { 'not-started': 'Not calibrated', 'awaiting-status': 'Waiting for device', uncalibrated: 'Ready to calibrate', preparing: 'Get comfortable', calibrating: 'Hold still', ready: 'Calibrated', 'sensor-error': 'Check sensor' };
const hands = { off: 'Camera off', unbound: 'Confirm your left hand', searching: 'Looking for your left hand', tracking: 'Left hand tracked', 'brief-loss': 'Finding hand · volume held', lost: 'Left hand lost · volume held' };
const tempos = { waiting: 'Waiting for your first stroke', warming: 'Finding your tempo', tracking: 'Following your right hand', verifying: 'Settling into your new tempo', idle: 'Holding your last tempo', 'out-of-range': 'Holding tempo · use 50–180 BPM' };
const follows = { manual: 'Set the pace with the slider.', waiting: 'Start conducting to set the pace.', measuring: 'A few steady strokes will find your tempo.', tracking: 'Your right hand sets the pace.', holding: 'Music continues at your last tempo.' };
const gestures = { None: 'No playback gesture', Open_Palm: 'Open palm · resume', Closed_Fist: 'Closed fist · pause' };

export function renderStatus(root, state, { supported = true, now = performance.now() } = {}) {
  let v = views.get(root);
  if (!v) {
    root.innerHTML = studioMarkup();
    v = Object.fromEntries([...root.querySelectorAll('[id]')].map(el => [el.id, el]));
    views.set(root, v);
  }
  const ready = readiness(state, supported);
  const connected = state.serialPhase === 'connected';
  const manual = state.experienceMode === 'manual';
  const playing = state.playbackState === 'playing';
  const paused = state.playbackState === 'paused';
  const busy = state.performanceBusy || state.audioBusy;
  root.dataset.mode = state.experienceMode; root.dataset.playback = state.playbackState;
  root.dataset.motion = state.visualReducedMotion || state.systemReducedMotion ? 'reduced' : 'full';
  v.stage.dataset.theme = state.sceneTheme; v.stage.dataset.scene = state.scenePhase;
  v['scene-theme'].value = state.sceneTheme;
  v['reduce-motion'].checked = state.visualReducedMotion || state.systemReducedMotion;
  v['reduce-motion'].disabled = state.systemReducedMotion;
  text(v['motion-preference'], state.systemReducedMotion ? 'Your system’s reduced-motion preference is active.' : 'Keep the scene still while retaining hand position feedback.');
  text(v['scene-reading'], state.scenePhase === 'ready' ? 'A living scene, shaped by your tempo, strokes and volume.' : state.scenePhase === 'loading' ? 'Preparing your visual space…' : state.scenePhase === 'lost' ? 'Visual effects are recovering. Music controls remain available.' : state.sceneError ?? 'Enhanced visuals are unavailable. Music controls remain available.');
  for (const mode of ['conduct', 'manual']) {
    v[`mode-${mode}`].setAttribute('aria-pressed', String(state.experienceMode === mode));
    v[`mode-${mode}`].disabled = state.performanceActive || busy;
  }
  text(v['mode-hint'], state.performanceActive ? 'End this performance to switch modes.' : manual ? 'A listening space. Explore the music with the sliders.' : 'Right hand for rhythm, left hand for sound.');
  text(v['ready-title'], ready.title); text(v['ready-hint'], ready.hint);
  v['setup-link'].hidden = manual || ready.ready;
  text(v['volume-display'], state.volumeDb.toFixed(0));
  v.focus.disabled = !document.fullscreenElement && !ready.ready && !state.performanceActive;
  const done = [connected, state.calibrationState === 'ready', state.cameraReady, state.leftHandBound];
  ['connect', 'calibrate', 'camera', 'left'].forEach((step, i) => { v[`step-${step}`].dataset.complete = String(done[i]); v[`step-${step}`].dataset.current = String(ready.step === step); });
  text(v['setup-progress'], manual ? 'LISTEN MODE' : `${done.filter(Boolean).length} / 4 READY`);
  text(v['connection-status'], connections[state.serialPhase] ?? state.serialPhase);
  text(v['calibration-status'], calibrations[state.calibrationState] ?? state.calibrationState);
  text(v['camera-status'], state.cameraPhase === 'starting' ? 'Starting camera…' : state.cameraReady ? 'Camera enabled' : state.cameraPhase === 'error' ? 'Try enabling again' : 'Camera off');
  text(v['binding-status'], state.leftHandBound ? 'Left hand confirmed' : state.handBindingReady ? 'Ready to confirm' : state.cameraReady ? 'Show only your left hand' : 'Enable camera first');
  text(v.connect, state.serialConnected ? 'Disconnect' : state.serialPhase === 'connecting' ? 'Choosing…' : 'Connect');
  v.connect.disabled = !supported || busy || ['connecting', 'disconnecting'].includes(state.serialPhase);
  v.calibrate.disabled = !connected || state.actionPending || state.performanceActive || busy || state.calibrationState === 'sensor-error';
  text(v.calibrate, state.calibrationCountdown !== null ? `Still in ${state.calibrationCountdown}s` : state.calibrationState === 'calibrating' ? 'Hold still…' : state.calibrationState === 'ready' ? 'Recalibrate' : 'Calibrate');
  text(v['camera-toggle'], state.cameraPhase === 'starting' ? 'Cancel' : state.cameraReady ? 'Turn off' : 'Enable'); v['camera-toggle'].disabled = busy;
  v['bind-left'].disabled = !state.cameraReady || !state.handBindingReady || busy; text(v['bind-left'], state.leftHandBound ? 'Reconfirm' : 'Confirm');
  text(v.notice, manual ? 'No device or camera connection is required to listen.' : supported ? state.notice : ready.hint);
  error(v.error, state.error); error(v['camera-error'], state.cameraError); error(v['music-error'], state.musicError); error(v['performance-error'], state.performanceError);
  text(v['stage-status'], busy ? 'GETTING READY' : playing ? manual ? 'LISTENING' : 'CONDUCTING' : paused ? 'TAKING A BREATH' : 'READY WHEN YOU ARE');
  v['live-dot'].dataset.live = String(playing);
  text(v['stage-kicker'], playing ? manual ? 'A MOMENT TO LISTEN' : 'YOUR GESTURES BECOME SOUND' : paused ? 'THE MUSIC WILL WAIT FOR YOU' : 'THE SPACE BETWEEN SOUND & SILENCE');
  text(v['stage-title'], paused ? 'Paused' : playing ? 'In the flow' : 'Ready when you are');
  text(v['stage-description'], playing ? '' : paused ? 'Continue exactly where you left off.' : manual ? 'Press Play. Make it your own.' : ready.ready ? 'Press Play to start conducting.' : 'Prepare your hands. Find your rhythm.');
  text(v['tempo-status'], manual ? 'LISTEN MODE / YOUR OWN PACE' : state.detectionActive ? tempos[state.tempoStatus] : 'Downward strokes give the beat.');
  text(v['beat-count'], state.receivedBeatCount); text(v['hand-status'], manual ? 'Manual controls' : hands[state.handStatus]); v.stage.dataset.tracked = String(state.handTracked && !manual);
  text(v['music-title'], state.musicInfo?.title ?? config.midiTitle);
  text(v['music-info'], state.musicInfo ? `${state.musicInfo.bars} bars · ${state.musicInfo.tracks} voices · on repeat` : state.musicLoadState === 'error' ? 'Score unavailable · retry below' : 'Loading the score…');
  text(v['music-bpm'], state.musicBpm.toFixed(0)); text(v['follow-status'], follows[state.tempoFollowStatus]);
  v['manual-tempo'].disabled = state.tempoSource !== 'manual'; v['manual-tempo'].value = String(state.manualBpm); text(v['manual-tempo-value'], `${state.manualBpm.toFixed(0)} BPM`);
  text(v['pace-help'], state.tempoSource === 'manual' ? 'Slower ← → Faster' : 'Following your right hand · 50–180 BPM');
  v.volume.value = String(state.volumeDb); v.volume.disabled = state.volumeSource !== 'manual'; text(v['volume-value'], `${state.volumeDb.toFixed(0)} dB`);
  text(v['volume-help'], state.volumeSource === 'manual' ? 'Softer ← → Louder' : state.handTracked ? 'Following your left hand’s height' : state.leftHandBound ? 'Volume holds until your left hand returns' : 'Confirm your left hand to control volume');
  v.play.disabled = busy || playing || state.musicLoadState === 'loading' || (!ready.ready && state.musicLoadState !== 'error');
  text(v.play, busy ? 'Getting ready…' : state.musicLoadState === 'error' ? 'Retry music' : playing ? 'Playing' : paused ? 'Resume' : 'Play');
  v.pause.disabled = !playing || busy; v.stop.disabled = !busy && !state.performanceActive && state.playbackState === 'stopped' && !state.detectionActive; v.stop.title = manual ? 'Stop & rewind' : 'End performance';
  text(v['playback-status'], playing ? 'Playing' : paused ? 'Paused' : 'Stopped'); text(v['music-position'], state.musicInfo ? `Bar ${state.musicBar} / ${state.musicInfo.bars} · Beat ${state.musicBeat}` : 'Preparing music'); v['music-progress'].value = state.musicProgress;
  text(v['audio-status'], state.audioReady ? 'Pause keeps your place. End returns to the start.' : 'Sound starts only when you press play.');
  text(v['device-model'], state.deviceModel ? `UNO / ${state.deviceModel}` : 'YOUR SETUP'); v['camera-placeholder'].hidden = state.cameraReady;
  text(v['camera-notice'], state.leftHandBound ? 'Your left hand is confirmed. Keep it comfortably in the frame.' : state.handBindingReady ? 'One hand is stable. Confirm only if this is your left hand.' : 'Show only your left hand. Keep your right hand out of view until you confirm.');
  text(v['hand-reading'], state.handTracked ? `Hand height ${Math.round((1 - state.palmY) * 100)}% · Tracking confidence ${Math.round(state.handednessConfidence * 100)}%` : 'Left-hand height controls volume; a fist pauses and an open palm resumes.');
  text(v['gesture-reading'], state.gestureControlsEnabled ? gestures[state.gesture] ?? 'No playback gesture' : 'Playback gestures off'); v['gesture-progress'].value = state.gestureProgress;
  v['stage-gesture'].hidden = manual || !state.handTracked || !state.gestureControlsEnabled;
  text(v['stage-gesture-label'], state.gesture === 'None' ? 'Fist to pause · palm to resume' : gestures[state.gesture]);
  v['stage-gesture-progress'].value = state.gestureProgress;
  v['tempo-source'].value = state.tempoSource; v['volume-source'].value = state.volumeSource; v['gesture-controls'].checked = state.gestureControlsEnabled;
  v['control-response'].value = state.controlResponse;
  text(v['camera-stats'], state.cameraReady ? `${state.cameraFrames} frames processed · Last inference ${state.cameraInferenceMs?.toFixed(0) ?? '—'} ms` : 'Camera access is optional in Listen mode.');
  v.reset.disabled = busy; v.export.disabled = !state.eventLog.length;
  v.detect.disabled = !connected || state.actionPending || state.calibrationState !== 'ready' || state.performanceActive || busy; text(v.detect, state.detectionActive ? 'Stop detection' : 'Start detection');
  v.raw.disabled = !connected || state.actionPending || state.calibrationState === 'sensor-error'; text(v.raw, state.rawStreamActive ? 'Disable raw stream' : 'Enable raw stream');
  text(v['debug-counts'], `Invalid frames ${state.invalidFrames} · Filtered intervals ${state.ignoredBeatCount} · Raw samples ${state.rawSamples}`);
  const age = state.lastBeatReceivedAt === null ? null : Math.max(0, now - state.lastBeatReceivedAt);
  text(v['sensor-reading'], `Detected tempo: ${state.measuredBpm?.toFixed(1) ?? '—'} BPM · Intensity: ${Math.round(state.lastBeatIntensity * 100)}% · Last stroke: ${age === null ? 'none' : `${(age / 1000).toFixed(1)}s ago`}`);
  text(v['raw-values'], state.lastImu ? `Acceleration m/s²: ${state.lastImu.slice(0, 3).map(n => n.toFixed(3)).join(' / ')}\nRotation rad/s: ${state.lastImu.slice(3).map(n => n.toFixed(3)).join(' / ')}` : 'Raw streaming is off by default. Beat detection continues to sample the sensor.');
  const rule = gestureRule(state.rawGesture);
  text(v['gesture-debug'], state.handTracked ? `Raw gesture: ${state.rawGesture} · Confidence ${state.rawGestureConfidence.toFixed(3)} · Threshold ${rule.confidence.toFixed(2)} · Stable results ${Math.min(state.gestureProgress * rule.results, rule.results).toFixed(0)} / ${rule.results}` : 'Raw gesture: waiting for valid left-hand tracking');
  text(v['event-log'], state.eventLog.slice(-12).map(item => `${item.at}  ${item.text}`).join('\n'));
  return v;
}

export function pulseBeat(view) {
  if (matchMedia('(prefers-reduced-motion: reduce)').matches || view.studio.closest('#app').dataset.motion === 'reduced') return;
  view['beat-pulse'].animate([{ transform: 'scale(1)', opacity: 1 }, { transform: 'scale(2.4)', opacity: .2 }, { transform: 'scale(1)', opacity: 1 }], { duration: 380 });
}
