import { config } from './config.js';
import { gestureRule } from './hand-control.js';
import { readiness } from './experience.js';

const views = new WeakMap();
const text = (el, value) => { if (el.textContent !== String(value)) el.textContent = value; };
const error = (el, message) => { el.hidden = !message; text(el, message ?? ''); };
const icon = path => `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" aria-hidden="true">${path}</svg>`;
const arrow = icon('<path d="M5 12h14m-6-6 6 6-6 6"/>');
const camera = icon('<rect x="3" y="6" width="13" height="12" rx="3"/><path d="m16 10 5-3v10l-5-3"/>');
const connections = { disconnected: 'Not connected', connecting: 'Choose a device', initializing: 'Starting device', connected: 'Connected', disconnecting: 'Disconnecting', unresponsive: 'No response' };
const calibrations = { 'not-started': 'Not calibrated', 'awaiting-status': 'Waiting for device', uncalibrated: 'Ready to calibrate', preparing: 'Get comfortable', calibrating: 'Hold still', ready: 'Calibrated', 'sensor-error': 'Check sensor' };
const hands = { off: 'Camera off', unbound: 'Confirm your left hand', searching: 'Looking for your left hand', tracking: 'Left hand tracked', 'brief-loss': 'Finding hand · volume held', lost: 'Left hand lost · volume held' };
const tempos = { waiting: 'Waiting for your first stroke', warming: 'Finding your tempo', tracking: 'Following your right hand', verifying: 'Settling into your new tempo', idle: 'Holding your last tempo', 'out-of-range': 'Holding tempo · use 50–180 BPM' };
const follows = { manual: 'Set the pace with the slider.', waiting: 'Start conducting to set the pace.', measuring: 'A few steady strokes will find your tempo.', tracking: 'Your right hand sets the pace.', holding: 'Music continues at your last tempo.' };
const gestures = { None: 'No playback gesture', Open_Palm: 'Open palm · resume', Closed_Fist: 'Closed fist · pause' };

export function renderStatus(root, state, { supported = true, now = performance.now() } = {}) {
  let v = views.get(root);
  if (!v) {
    root.innerHTML = `
      <a class="skip-link" href="#studio">Skip to the studio</a>
      <header class="site-header"><a class="brand" href="#" aria-label="Air Conductor home"><span class="brand-mark" aria-hidden="true">a<span>c</span></span><span>AIR<br>CONDUCTOR</span></a><span class="header-note">A little motion. A lot of music.</span><a class="guide-link" href="#guide">How to conduct ${arrow}</a></header>
      <section class="intro"><div><p class="eyebrow">YOUR HANDS. YOUR ORCHESTRA.</p><h1>Make music<br><em>with motion.</em></h1></div><div class="intro-aside"><p>Give the beat. Shape the sound.<br>Turn a simple gesture into something you can hear.</p><div class="mode-switch" role="group" aria-label="Performance mode"><button id="mode-conduct" aria-pressed="true">Conduct <span>With your hands</span></button><button id="mode-manual" aria-pressed="false">Listen <span>No devices needed</span></button></div><p id="mode-hint" class="micro"></p></div></section>
      <section id="studio" class="studio" aria-label="Music studio" tabindex="-1"><div id="stage" class="stage"><canvas id="motion-canvas" aria-hidden="true"></canvas><div class="stage-top"><span class="stage-tag"><i id="live-dot"></i><span id="stage-status"></span></span><button id="focus" class="icon-button" aria-label="Enter fullscreen studio" title="Fullscreen studio">${icon('<path d="M8 3H3v5m13-5h5v5M3 16v5h5m13-5v5h-5"/>')}</button></div><div class="stage-center"><p class="eyebrow" id="stage-kicker"></p><h2 id="stage-title"></h2><p id="stage-description"></p></div><div class="stage-bottom"><div><span class="micro">RIGHT HAND / RHYTHM</span><p id="tempo-status"></p></div><div class="stroke-counter"><span id="beat-pulse" class="pulse-dot" aria-hidden="true"></span><strong id="beat-count">0</strong><span>strokes</span></div></div><div class="stage-hand"><span class="hand-dot"></span><span id="hand-status"></span></div></div>
      <aside class="sound-desk" aria-label="Playback controls"><div class="score-heading"><div><p class="eyebrow">ON THE MUSIC STAND</p><h2 id="music-title">Ode to Joy</h2><p id="music-info" class="micro"></p></div><span class="score-mark" aria-hidden="true">♫</span></div><div class="tempo-readout"><span class="eyebrow">TEMPO</span><div><strong id="music-bpm">100</strong><span>BPM</span></div><p id="follow-status" class="micro"></p></div><div class="desk-sliders"><label for="manual-tempo">Pace <output id="manual-tempo-value"></output></label><input id="manual-tempo" type="range" min="${config.minBpm}" max="${config.maxBpm}" value="${config.defaultBpm}" aria-describedby="pace-help"><p id="pace-help" class="micro"></p><label for="volume">Volume <output id="volume-value"></output></label><input id="volume" type="range" min="${config.minVolumeDb}" max="${config.maxVolumeDb}" value="${config.defaultVolumeDb}" aria-describedby="volume-help"><p id="volume-help" class="micro"></p></div><div class="transport"><button id="play" class="primary">Start performance ${arrow}</button><div class="transport-secondary"><button id="pause" class="secondary" disabled>Pause</button><button id="stop" class="secondary" disabled>End performance</button></div></div><div class="score-progress"><div><span id="music-position"></span><span id="playback-status"></span></div><progress id="music-progress" value="0" max="1" aria-label="Music loop progress"></progress></div><p id="audio-status" class="micro"></p><p id="performance-error" class="inline-error" role="alert" hidden></p><p id="music-error" class="inline-error" role="alert" hidden></p></aside></section>
      <section id="setup" class="setup" aria-label="Prepare to conduct"><div class="setup-heading"><div><p class="eyebrow">BEFORE THE FIRST BEAT</p><h2 id="ready-title"></h2><p id="ready-hint"></p></div><span id="setup-progress" class="setup-progress"></span></div><div class="setup-grid">${[['connect', 'Right wrist', 'connection-status', 'Connect'], ['calibrate', 'Still point', 'calibration-status', 'Calibrate'], ['camera', 'Camera', 'camera-status', 'Enable'], ['left', 'Left hand', 'binding-status', 'Confirm']].map(([step, title, status, label], i) => `<article id="step-${step}" class="setup-step"><span class="step-number">0${i + 1}</span><div><h3>${title}</h3><p id="${status}"></p></div><button id="${['connect', 'calibrate', 'camera-toggle', 'bind-left'][i]}" class="step-button">${label} ${arrow}</button></article>`).join('')}</div><p id="notice" class="micro" role="status" aria-live="polite"></p><p id="error" class="inline-error" role="alert" hidden></p><p id="camera-error" class="inline-error" role="alert" hidden></p></section>
      <details id="settings" class="settings"><summary><span>Camera & session settings</span><span class="summary-meta" id="device-model">YOUR SETUP</span></summary><div class="settings-body"><div class="camera-preview"><video id="camera-video" muted playsinline aria-label="Mirrored camera preview"></video><canvas id="camera-overlay" aria-hidden="true"></canvas><div id="camera-placeholder">${camera}<span>Your camera preview appears here.</span></div></div><div class="camera-settings"><p id="camera-notice"></p><p id="hand-reading" class="micro"></p><p id="gesture-reading"></p><progress id="gesture-progress" value="0" max="1" aria-label="Stable gesture recognition progress"></progress><div class="source-controls"><label>Tempo source<select id="tempo-source"><option value="conducting">Right-hand strokes</option><option value="manual">Manual slider</option></select></label><label>Volume source<select id="volume-source"><option value="left-hand">Left-hand height</option><option value="manual">Manual slider</option></select></label></div><label class="check-label"><input id="gesture-controls" type="checkbox" checked>Left-hand pause & resume gestures</label><p class="micro">Hold a fist to pause; open your palm to continue. If your left hand leaves the frame, volume holds. Camera processing stays in this browser.</p><div class="settings-actions"><button id="reset" class="secondary">Reset devices</button><button id="export" class="text-button">Download session CSV</button></div><p id="camera-stats" class="micro"></p></div></div></details>
      <section id="guide" class="guide" aria-label="How to conduct"><div><p class="eyebrow">A LANGUAGE YOU ALREADY KNOW</p><h2>Small gestures.<br><em>Big expression.</em></h2></div><article><span class="gesture-symbol" aria-hidden="true">↓</span><h3>Give the beat.</h3><p>Conduct clear downward strokes with your right hand. Lift to reset. A few steady beats establish the tempo.</p></article><article><span class="gesture-symbol" aria-hidden="true">↕</span><h3>Shape the sound.</h3><p>Raise your left hand for more volume, lower it for less. Keep your palm facing the camera.</p></article><article><span class="gesture-symbol" aria-hidden="true">◯</span><h3>Take a breath.</h3><p>Close your left hand to pause. Open it to resume exactly where you left off. Hold each gesture briefly.</p></article></section>
      <details class="diagnostics"><summary><span>Diagnostics</span><span class="summary-meta">OPTIONAL</span></summary><div class="debug-body"><div class="debug-toolbar"><button id="detect" class="secondary small">Start detection</button><button id="raw" class="secondary small">Enable raw stream</button><button id="copy-debug" class="secondary small">Copy snapshot</button></div><p id="debug-counts" class="micro"></p><p id="sensor-reading" class="mono"></p><p id="raw-values" class="mono"></p><p id="gesture-debug" class="mono"></p><textarea id="debug-snapshot" class="mono" rows="5" readonly hidden aria-label="Copyable diagnostic snapshot"></textarea><p id="copy-debug-status" class="micro" role="status"></p><pre id="event-log" aria-label="Recent session messages"></pre></div></details>
      <footer><a class="footer-brand" href="#">AIR CONDUCTOR</a><span>Music, at your fingertips.</span><span>Built for Chrome & Edge · Local processing</span></footer>`;
    root.querySelector('.stage-center').insertAdjacentHTML('beforeend', '<a id="setup-link" class="stage-setup-link" href="#setup">Prepare your hands ↓</a>');
    root.querySelector('.stage-hand').insertAdjacentHTML('afterend', '<div id="stage-gesture" class="stage-gesture"><span id="stage-gesture-label"></span><progress id="stage-gesture-progress" value="0" max="1" aria-label="Playback gesture confirmation"></progress></div>');
    root.querySelector('.setup').insertAdjacentHTML('beforeend', '<a id="studio-link" class="ready-link" href="#studio" hidden>You’re ready. Back to the studio ↑</a>');
    root.querySelector('#guide').insertAdjacentHTML('beforebegin', `<details id="visual-settings" class="settings"><summary><span>Visual atmosphere</span><span class="summary-meta">MAKE IT YOURS</span></summary><div class="visual-settings-body"><label for="scene-theme">Scene palette<select id="scene-theme"><option value="aurora">Aurora · jade & gold</option><option value="nocturne">Nocturne · lilac & ice</option></select></label><div><label class="check-label"><input id="reduce-motion" type="checkbox">Reduce visual motion</label><p id="motion-preference" class="micro">Keep the scene still while retaining hand position feedback.</p></div><p id="scene-reading" class="micro" role="status"></p></div></details>`);
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
  v['studio-link'].hidden = manual || !ready.ready;
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
  text(v['stage-title'], playing ? manual ? 'Let it flow.' : 'Find your rhythm.' : paused ? 'Take a breath.' : 'It starts with you.');
  text(v['stage-description'], playing ? manual ? 'Move the sliders. Make it your own.' : 'Down for the beat. Up for the sound.' : paused ? 'Press Resume to continue.' : manual ? 'Press play. No devices needed.' : ready.ready ? 'You’re ready. Start your performance.' : ready.hint);
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
  text(v.play, busy ? 'Getting ready…' : state.musicLoadState === 'error' ? 'Retry music' : playing ? 'Playing' : paused ? 'Resume' : manual ? 'Play music →' : 'Start performance →');
  v.pause.disabled = !playing || busy; v.stop.disabled = !busy && !state.performanceActive && state.playbackState === 'stopped' && !state.detectionActive; text(v.stop, manual ? 'Stop & rewind' : 'End performance');
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
