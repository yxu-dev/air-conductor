import './style.css';
import { state } from './state.js';
import { renderStatus, pulseBeat } from './visuals.js';
import { ConductorSession } from './session.js';
import { createMusicSession } from './audio.js';
import { HandControl } from './hand-control.js';
import { VisionSession } from './vision.js';
import { Experience } from './experience.js';
import { requireStudioStyles } from './style-readiness.js';
import { StudioWindows } from './studio-windows.js';

const root = document.querySelector('#app');
requireStudioStyles(root);
const motionPreference = matchMedia('(prefers-reduced-motion: reduce)');
let view, stage, experience, windows;
let disposed = false, pageHidden = false;
const music = createMusicSession(state, { onEvent: (kind, data) => session.recordMusicEvent(kind, data) });
const session = new ConductorSession({ state,
  onBeat: beat => { music.tick(); if (view) pulseBeat(view); stage?.pulse(beat.intensity); },
});
session.recordHostEvent('CONTROL', 'RESPONSE', { profile: state.controlResponse });
const control = new HandControl({ state, music,
  allowPlayback: () => state.performanceActive && !state.performanceBusy && state.experienceMode === 'conduct',
  onEvent: (kind, data) => session.recordVisionEvent(kind, data) });
const update = () => {
  state.systemReducedMotion = motionPreference.matches;
  session.tick(); music.tick(); experience?.tick(); control.tick();
  view = renderStatus(root, state, { supported: session.transport.supported });
  windows?.refresh();
  stage?.setSuspended(state.sceneSuspended);
};
update();
const vision = new VisionSession({ state, control, video: view['camera-video'], overlay: view['camera-overlay'],
  onEvent: (kind, data) => session.recordVisionEvent(kind, data) });
experience = new Experience({ state, session, music, control, vision, onChange: update,
  onEvent: (kind, data) => {
    session.recordHostEvent('EXPERIENCE', kind, data);
  } });
experience.setMode('conduct');
windows = new StudioWindows({ root, view, state, supported: session.transport.supported, onChange: update });
update();
// Visuals load independently, so a delayed or unavailable GPU cannot block playback.
void import('./motion-stage.js').then(({ MotionStage }) => {
  if (disposed) return;
  stage = new MotionStage(view['motion-canvas'], state);
  if (pageHidden) stage.stop();
  update();
}).catch(() => {
  if (disposed) return;
  state.scenePhase = 'fallback';
  state.sceneError = 'Enhanced visuals are unavailable. Music and hand controls remain available.';
  update();
});
void music.load().finally(update).catch(() => {});

async function action(callback, target = 'error') {
  state[target] = null;
  try { await callback(); }
  catch (error) { state[target] ??= error.message; }
  update();
}

view.connect.addEventListener('click', () => { void action(async () => {
  if (state.serialConnected) { await experience.end(); await session.disconnect(); }
  else await session.connect();
}); });
view.calibrate.addEventListener('click', () => { void action(() => session.calibrate()); });
view.detect.addEventListener('click', () => { void action(() => session.setDetection(!state.detectionActive)); });
view.raw.addEventListener('click', () => { void action(() => session.setRawStream(!state.rawStreamActive)); });
view.play.addEventListener('click', () => { void action(() => state.musicLoadState === 'error' ? music.load() : experience.start(), 'performanceError'); });
view.pause.addEventListener('click', () => { music.pause(); update(); });
view.stop.addEventListener('click', () => { void action(() => experience.end(), 'performanceError'); });
view.reset.addEventListener('click', () => { void action(() => experience.reset(), 'performanceError'); });
for (const mode of ['conduct', 'manual']) view[`mode-${mode}`].addEventListener('click', () => { experience.setMode(mode); });
view['tempo-source'].addEventListener('change', event => { music.setSource(event.target.value); update(); });
view['control-response'].addEventListener('change', event => { session.setControlResponse(event.target.value); update(); });
view['manual-tempo'].addEventListener('input', event => { music.setManualBpm(Number(event.target.value)); update(); });
view.volume.addEventListener('input', event => { control.setManualVolume(Number(event.target.value)); update(); });
view['volume-source'].addEventListener('change', event => { control.setVolumeSource(event.target.value); update(); });
view['gesture-controls'].addEventListener('change', event => { control.setGestureControls(event.target.checked); update(); });
view['scene-theme'].addEventListener('change', event => {
  state.sceneTheme = event.target.value;
  session.recordHostEvent('VISUAL', 'THEME', { theme: state.sceneTheme }); update();
});
view['reduce-motion'].addEventListener('change', event => {
  state.visualReducedMotion = event.target.checked;
  session.recordHostEvent('VISUAL', 'REDUCE_MOTION', { enabled: state.visualReducedMotion }); update();
});
view['camera-toggle'].addEventListener('click', () => { void action(async () => {
  if (['starting', 'running'].includes(state.cameraPhase)) vision.stop();
  else { windows.open('settings', 'left'); await vision.start(); }
}, 'cameraError'); });
view['bind-left'].addEventListener('click', () => { void action(() => control.bindLeft(), 'cameraError'); });
view.focus.addEventListener('click', () => { void action(async () => {
  if (document.fullscreenElement) await document.exitFullscreen();
  else if (view.studio.requestFullscreen) await view.studio.requestFullscreen();
  else throw new Error('Fullscreen is unavailable in this browser.');
}, 'performanceError'); });
const fullscreenChange = () => {
  const label = document.fullscreenElement ? 'Exit fullscreen studio' : 'Enter fullscreen studio';
  view.focus.setAttribute('aria-label', label); view.focus.title = label;
};
document.addEventListener('fullscreenchange', fullscreenChange);
view['copy-debug'].addEventListener('click', () => {
  update();
  const snapshot = view['debug-snapshot'];
  snapshot.value = [new Date().toISOString(), `Mode: ${state.experienceMode}`, view['hand-status'].textContent,
    view['hand-reading'].textContent, view['gesture-debug'].textContent,
    `Playback: ${state.playbackState}`, `Gesture controls: ${state.gestureControlsEnabled ? 'on' : 'off'}`].join('\n');
  snapshot.hidden = false;
  const status = view['copy-debug-status'];
  status.textContent = 'Snapshot captured. Select the text to copy it.';
  if (navigator.clipboard?.writeText) void navigator.clipboard.writeText(snapshot.value)
    .then(() => { status.textContent = 'Snapshot copied.'; })
    .catch(() => { status.textContent = 'Select the snapshot text to copy it.'; });
  else { snapshot.focus(); snapshot.select(); }
});
view.export.addEventListener('click', () => {
  const url = URL.createObjectURL(new Blob(['\uFEFF', session.exportCsv()], { type: 'text/csv;charset=utf-8' }));
  const anchor = document.createElement('a');
  const date = new Date();
  const stamp = [date.getFullYear(), date.getMonth() + 1, date.getDate(), date.getHours(), date.getMinutes(), date.getSeconds()].map(value => String(value).padStart(2, '0')).join('-');
  anchor.href = url; anchor.download = `air-conductor-beats-${stamp}.csv`; anchor.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
});

let refresh = setInterval(update, 150);
const pageHide = () => { pageHidden = true; clearInterval(refresh); refresh = null; stage?.stop(); vision.stop(); music.stop(); state.performanceActive = false; void session.disconnect(); };
const pageShow = () => { pageHidden = false; if (refresh === null) { update(); stage?.start(); refresh = setInterval(update, 150); } };
window.addEventListener('pagehide', pageHide);
window.addEventListener('pageshow', pageShow);
if (import.meta.hot) import.meta.hot.dispose(() => {
  disposed = true;
  clearInterval(refresh); window.removeEventListener('pagehide', pageHide); window.removeEventListener('pageshow', pageShow);
  document.removeEventListener('fullscreenchange', fullscreenChange);
  windows?.dispose();
  stage?.dispose(); music.dispose(); vision.dispose(); void session.transport.dispose();
});
