import './style.css';
import { state } from './state.js';
import { renderStatus, pulseBeat } from './visuals.js';
import { ConductorSession } from './session.js';
import { createMusicSession } from './audio.js';
import { HandControl } from './hand-control.js';
import { VisionSession } from './vision.js';

const root = document.querySelector('#app');
let view;
const music = createMusicSession(state, { onEvent: (kind, data) => session.recordMusicEvent(kind, data) });
const session = new ConductorSession({ state,
  onBeat: (beat) => { music.tick(); if (view) pulseBeat(view, beat.intensity); },
});
const control = new HandControl({ state, music, onEvent: (kind, data) => session.recordVisionEvent(kind, data) });
const update = () => { session.tick(); music.tick(); control.tick(); view = renderStatus(root, state, { supported: session.transport.supported }); };
update();
const vision = new VisionSession({ state, control, video: view['camera-video'], overlay: view['camera-overlay'],
  onEvent: (kind, data) => session.recordVisionEvent(kind, data) });
void music.load().catch(() => {});

async function action(callback) {
  try { await callback(); }
  catch (error) { session.showError(error.message); }
  update();
}

view.connect.addEventListener('click', () => { void action(() => state.serialConnected ? session.disconnect() : session.connect()); });
view.calibrate.addEventListener('click', () => { void action(() => session.calibrate()); });
view.detect.addEventListener('click', () => { void action(() => session.setDetection(!state.detectionActive)); });
view.raw.addEventListener('click', () => { void action(() => session.setRawStream(!state.rawStreamActive)); });
async function musicAction(callback) {
  try { await callback(); }
  catch (error) { state.musicError = error.message; }
  update();
}
view.play.addEventListener('click', () => { void musicAction(() => state.musicLoadState === 'error' ? music.load() : music.play()); });
view.pause.addEventListener('click', () => { music.pause(); update(); });
view.stop.addEventListener('click', () => { music.stop(); update(); });
view['tempo-source'].addEventListener('change', event => { void musicAction(() => music.setSource(event.target.value)); });
view['manual-tempo'].addEventListener('input', event => { void musicAction(() => music.setManualBpm(Number(event.target.value))); });
view.volume.addEventListener('input', event => { void musicAction(() => control.setManualVolume(Number(event.target.value))); });
async function cameraAction(callback) {
  state.cameraError = null;
  try { await callback(); }
  catch (error) { state.cameraError ??= error.message; }
  update();
}
view['camera-toggle'].addEventListener('click', () => { void cameraAction(() => ['starting', 'running'].includes(state.cameraPhase) ? vision.stop() : vision.start()); });
view['bind-left'].addEventListener('click', () => { void cameraAction(() => control.bindLeft()); });
view['volume-source'].addEventListener('change', event => { void musicAction(() => control.setVolumeSource(event.target.value)); });
view['gesture-controls'].addEventListener('change', event => { control.setGestureControls(event.target.checked); update(); });
view['copy-debug'].addEventListener('click', () => {
  update();
  const text = [new Date().toISOString(), view['hand-status'].textContent,
    view['hand-reading'].textContent, view['gesture-debug'].textContent,
    view['playback-status'].textContent, `播放手势：${state.gestureControlsEnabled ? '开启' : '关闭'}`].join('\n');
  const snapshot = view['debug-snapshot'];
  snapshot.value = text;
  snapshot.hidden = false;
  const status = view['copy-debug-status'];
  status.textContent = '快照已固定，可选中文字复制。';
  if (navigator.clipboard?.writeText) {
    void navigator.clipboard.writeText(text).then(() => {
      status.textContent = '调试快照已复制，可直接粘贴到聊天中。';
    }).catch(() => { status.textContent = '快照已固定，请在文本框中选中文字复制。'; });
  } else { snapshot.focus(); snapshot.select(); }
});
view.export.addEventListener('click', () => {
  const url = URL.createObjectURL(new Blob(['\uFEFF', session.exportCsv()], { type: 'text/csv;charset=utf-8' }));
  const anchor = document.createElement('a');
  const date = new Date();
  const stamp = [date.getFullYear(), date.getMonth() + 1, date.getDate(), date.getHours(), date.getMinutes(), date.getSeconds()].map(value => String(value).padStart(2, '0')).join('-');
  anchor.href = url;
  anchor.download = `air-conductor-beats-${stamp}.csv`;
  anchor.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
});

let refresh = setInterval(update, 150);
const pageHide = () => { clearInterval(refresh); refresh = null; vision.stop(); music.stop(); void session.disconnect(); };
const pageShow = () => { if (refresh === null) { update(); refresh = setInterval(update, 150); } };
window.addEventListener('pagehide', pageHide);
window.addEventListener('pageshow', pageShow);
if (import.meta.hot) import.meta.hot.dispose(() => {
  clearInterval(refresh);
  window.removeEventListener('pagehide', pageHide);
  window.removeEventListener('pageshow', pageShow);
  music.dispose();
  vision.dispose();
  void session.transport.dispose();
});
