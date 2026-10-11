import test from 'node:test';
import assert from 'node:assert/strict';
import { config } from '../src/config.js';
import { createState } from '../src/state.js';
import { HandControl, selectHand, volumeForHeight } from '../src/hand-control.js';
import { VisionSession } from '../src/vision.js';
import { MusicSession } from '../src/music-session.js';
import { ConductorSession } from '../src/session.js';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';

const hand = (label = 'Left', y = .5, gesture = 'None', score = .95) => ({ label, y, gesture, score });
function result(...hands) {
  return { landmarks: hands.map(h => Array.from({ length: 21 }, () => ({ x: .5, y: h.y }))),
    handedness: hands.map(h => [{ categoryName: h.label, score: h.score }]),
    gestures: hands.map(h => [{ categoryName: h.gesture, score: .95 }]) };
}
function fixture() {
  const state = createState();
  Object.assign(state, { cameraReady: true, audioReady: true, playbackState: 'playing' });
  const calls = [], events = [];
  let now = 0;
  const music = { setVolume: db => { state.volumeDb = db; calls.push(['volume', db]); },
    pause: () => { state.playbackState = 'paused'; calls.push(['pause']); },
    play: async () => { state.playbackState = 'playing'; calls.push(['play']); } };
  const control = new HandControl({ state, music, clock: () => now, onEvent: (...e) => events.push(e) });
  const frame = (r, at) => { now = at; control.process(r, now); };
  const bind = (label = 'Left', at = 0) => {
    for (let t = at; t <= at + 700; t += 100) frame(result(hand(label)), t);
    control.bindLeft();
  };
  return { state, control, calls, events, frame, bind, setTime: t => { now = t; } };
}

test('binding requires a stable single hand, and never enables controls before confirmation', () => {
  const f = fixture(); f.control.setVolumeSource('left-hand');
  for (let t = 0; t <= 1000; t += 100) f.frame(result(hand('Right', .2, 'Closed_Fist'), hand('Left', .8)), t);
  assert.equal(f.state.handBindingReady, false);
  assert.throws(() => f.control.bindLeft());
  assert.equal(f.calls.length, 0);
  f.bind('Left', 1100);
  assert.equal(f.state.leftHandBound, true);
  assert.equal(f.state.leftHandLabel, 'Left');
});

test('same-index handedness selection ignores result ordering, right motion and right fists', () => {
  const f = fixture(); f.bind(); f.control.setVolumeSource('left-hand');
  for (let t = 800; t <= 1900; t += 100) {
    const left = hand('Left', .5, 'Open_Palm'), right = hand('Right', t % 200 ? .2 : .8, 'Closed_Fist');
    f.frame(t % 200 ? result(left, right) : result(right, left), t);
  }
  assert.equal(f.state.playbackState, 'playing');
  assert.ok(f.calls.every(c => c[0] === 'volume'));
  assert.ok(f.calls.filter(c => c[0] === 'volume').every(c => Math.abs(c[1] + 16.5) < .001));
});

test('physical left binding supports a reversed input label without switching hands', () => {
  const f = fixture(); f.bind('Right');
  f.frame(result(hand('Left', .2, 'Closed_Fist'), hand('Right', .8)), 800);
  assert.equal(f.state.palmY, .8);
  for (let t = 900; t <= 1600; t += 100) f.frame(result(hand('Left', .2, 'Closed_Fist')), t);
  assert.equal(f.state.handTracked, false);
  assert.equal(f.state.handStatus, 'lost');
  assert.equal(f.state.playbackState, 'playing');
});

test('presentation gesture gate prevents an interrupted performance from resuming', () => {
  const f = fixture(); f.bind();
  f.state.playbackState = 'paused';
  let allowed = false;
  f.control.allowPlayback = () => allowed;
  for (let t = 800; t <= 1300; t += 100) f.frame(result(hand('Left', .5, 'Open_Palm')), t);
  assert.equal(f.state.playbackState, 'paused');
  assert.equal(f.state.gestureProgress, 0);
  allowed = true;
  for (let t = 1400; t <= 1800; t += 100) f.frame(result(hand('Left', .5, 'Open_Palm')), t);
  assert.equal(f.state.playbackState, 'playing');
});

test('height mapping clamps endpoints, smooths motion and restores manual volume', () => {
  assert.equal(volumeForHeight(.1), -3);
  assert.equal(volumeForHeight(.9), -30);
  assert.ok(Math.abs(volumeForHeight(.5) + 16.5) < 1e-10);
  const f = fixture(); f.bind(); f.control.setManualVolume(-22); f.control.setVolumeSource('left-hand');
  f.frame(result(hand('Left', .8)), 800);
  assert.equal(f.state.volumeDb, -30);
  f.frame(result(hand('Left', .2)), 900);
  assert.ok(f.state.volumeDb > -30 && f.state.volumeDb < -3);
  for (let t = 1000; t <= 2600; t += 100) f.frame(result(hand('Left', .2)), t);
  assert.ok(f.state.volumeDb > -3.3);
  f.control.setVolumeSource('manual');
  assert.equal(f.state.volumeDb, -22);
});

test('left fist/open require consecutive observations and pause/resume only once', async () => {
  const f = fixture(); f.bind();
  for (let t = 800; t <= 2000; t += 100) f.frame(result(hand('Left', .5, 'Closed_Fist')), t);
  assert.deepEqual(f.calls, [['pause']]);
  for (let t = 2100; t <= 3300; t += 100) f.frame(result(hand('Left', .5, 'Open_Palm')), t);
  assert.deepEqual(f.calls, [['pause'], ['play']]);
  f.state.playbackState = 'stopped';
  f.frame(result(hand()), 3400);
  for (let t = 3500; t <= 4100; t += 100) f.frame(result(hand('Left', .5, 'Open_Palm')), t);
  assert.equal(f.calls.length, 2); // Gesture never starts stopped audio.
});

test('loss, low confidence, ambiguous labels and frame stalls reset the hold timer', () => {
  const f = fixture(); f.bind();
  for (let t = 800; t <= 900; t += 100) f.frame(result(hand('Left', .5, 'Closed_Fist')), t);
  f.frame(result(hand('Right', .5, 'Closed_Fist')), 1000);
  for (let t = 1100; t <= 1200; t += 100) f.frame(result(hand('Left', .5, 'Closed_Fist')), t);
  assert.equal(f.calls.length, 0);
  const uncertain = result(hand('Left', .5, 'Closed_Fist')); uncertain.gestures[0][0].score = .3;
  f.frame(uncertain, 1300);
  f.frame(result(hand('Left', .5, 'Closed_Fist'), hand('Left', .5, 'Closed_Fist')), 1400);
  assert.equal(f.state.handTracked, false);
  f.frame(result(hand('Left', .5, 'Closed_Fist', .4)), 1500);
  assert.equal(f.state.handTracked, false);
  for (let t = 1600; t <= 1700; t += 100) f.frame(result(hand('Left', .5, 'Closed_Fist')), t);
  f.setTime(2200); f.control.tick();
  assert.equal(f.state.handStatus, 'lost');
  f.frame(result(hand('Left', .5, 'Closed_Fist')), 2300);
  assert.equal(f.state.gestureProgress, 1 / config.gestureStableResults);
  assert.equal(f.calls.length, 0);
});

test('five distinct observations resume a borderline open palm', () => {
  const f = fixture(); f.bind(); f.state.playbackState = 'paused';
  const palm = result(hand('Left', .5, 'Open_Palm')); palm.gestures[0][0].score = .66;
  f.frame(palm, 800); f.frame(palm, 800); f.frame(palm, 790);
  assert.equal(f.state.gestureProgress, 1 / config.openPalmStableResults);
  f.frame(palm, 850);
  assert.equal(f.calls.length, 0);
  f.frame(palm, 900);
  f.frame(palm, 950);
  assert.equal(f.calls.length, 0);
  f.frame(palm, 1000);
  assert.deepEqual(f.calls, [['play']]);
  assert.equal(f.state.rawGestureConfidence, .66);
});

test('low-confidence and unrelated gestures remain observable but cannot resume', () => {
  const f = fixture(); f.bind(); f.state.playbackState = 'paused';
  const palm = result(hand('Left', .5, 'Open_Palm')); palm.gestures[0][0].score = .54;
  for (let t = 800; t <= 1300; t += 100) f.frame(palm, t);
  assert.equal(f.state.rawGesture, 'Open_Palm');
  assert.equal(f.state.rawGestureConfidence, .54);
  assert.equal(f.state.gesture, 'None');
  assert.ok(f.events.some(e => e[0] === 'GESTURE_READING' && e[1].rawName === 'Open_Palm' && !e[1].accepted));
  for (let t = 1400; t <= 1800; t += 100) f.frame(result(hand('Left', .5, 'Victory')), t);
  assert.equal(f.state.rawGesture, 'Victory');
  assert.equal(f.calls.length, 0);
});

test('observed natural palm scores resume only after five accepted frames', () => {
  const f = fixture(); f.bind(); f.state.playbackState = 'paused';
  const palm = result(hand('Left', .5, 'Open_Palm'));
  const scores = [.627, .562, .617, .58, .60];
  scores.forEach((score, i) => {
    palm.gestures[0][0].score = score;
    f.frame(palm, 800 + i * 70);
    assert.equal(f.calls.length, i === 4 ? 1 : 0);
  });
  assert.deepEqual(f.calls, [['play']]);
  assert.ok(f.events.some(([kind, data]) => kind === 'GESTURE_READING' &&
    data.accepted && data.threshold === .55 && data.requiredResults === 5));
  for (let t = 1200; t <= 1600; t += 70) f.frame(palm, t);
  assert.deepEqual(f.calls, [['play']]);
});

test('a rejected palm observation or left-hand loss requires five new frames', () => {
  const f = fixture(); f.bind(); f.state.playbackState = 'paused';
  const palm = result(hand('Left', .5, 'Open_Palm')); palm.gestures[0][0].score = .60;
  for (let t = 800; t <= 1100; t += 100) f.frame(palm, t);
  const rejected = result(hand('Left', .5, 'Open_Palm')); rejected.gestures[0][0].score = .54;
  f.frame(rejected, 1200);
  for (let t = 1300; t <= 1600; t += 100) f.frame(palm, t);
  assert.equal(f.calls.length, 0);
  f.frame(result(hand('Right', .5, 'Open_Palm')), 1700);
  for (let t = 1800; t <= 2100; t += 100) f.frame(palm, t);
  assert.equal(f.calls.length, 0);
  f.frame(palm, 2200);
  assert.deepEqual(f.calls, [['play']]);
});

test('relaxed palm confidence never relaxes fist pause confidence', () => {
  const f = fixture(); f.bind();
  const fist = result(hand('Left', .5, 'Closed_Fist')); fist.gestures[0][0].score = .60;
  for (let t = 800; t <= 1400; t += 100) f.frame(fist, t);
  assert.equal(f.calls.length, 0);
  fist.gestures[0][0].score = .66;
  f.frame(fist, 1500); f.frame(fist, 1600);
  assert.equal(f.calls.length, 0);
  f.frame(fist, 1700);
  assert.deepEqual(f.calls, [['pause']]);
});

test('production Worker uses the two-gesture allowlist', async () => {
  let options;
  const sandbox = { self: { postMessage() {} }, importScripts() {},
    Vision: { FilesetResolver: { forVisionTasks: async () => ({}) },
      GestureRecognizer: { createFromOptions: async (_, o) => { options = o; return {}; } } } };
  vm.runInNewContext(readFileSync(new URL('../public/mediapipe/vision-worker.js', import.meta.url), 'utf8'), sandbox);
  await sandbox.self.onmessage({ data: { type: 'INIT', wasmUrl: '/wasm', modelUrl: '/model' } });
  assert.deepEqual(Array.from(options.cannedGesturesClassifierOptions.categoryAllowlist), ['Open_Palm', 'Closed_Fist']);
  assert.equal(options.numHands, 2);
});

test('paused/lost hands hold volume; invalid landmarks cannot drive controls', () => {
  const f = fixture(); f.bind(); f.control.setVolumeSource('left-hand');
  f.frame(result(hand('Left', .8)), 800);
  f.state.playbackState = 'paused';
  for (let t = 900; t <= 1400; t += 100) f.frame(result(hand('Left', .2)), t);
  assert.equal(f.state.volumeDb, -30);
  const invalid = result(hand()); invalid.landmarks[0][9].y = NaN;
  assert.equal(selectHand(invalid, 'Left'), null);
  for (let t = 1500; t <= 2100; t += 100) f.frame(result(hand('Right', .2)), t);
  assert.equal(f.state.volumeDb, -30);
  assert.equal(f.state.playbackState, 'paused');
  f.control.setGestureControls(false);
  for (let t = 2200; t <= 2900; t += 100) f.frame(result(hand('Left', .5, 'Open_Palm')), t);
  assert.equal(f.state.playbackState, 'paused');
});

function cameraFixture(overrides = {}) {
  const f = fixture(); f.state.cameraReady = false;
  let now = 0, stops = 0, terminated = 0, id = 0;
  const frames = new Map(), workers = [], tracks = [{ stop: () => { ++stops; }, addEventListener() {} }];
  const video = { readyState: 2, currentTime: 1, srcObject: null, play: async () => {}, pause() {} };
  const vision = new VisionSession({ state: f.state, control: f.control, video,
    media: { getUserMedia: async () => ({ getTracks: () => tracks }) },
    makeWorker: () => { const w = { postMessage: data => { if (data.type === 'INIT') queueMicrotask(() => w.onmessage({ data: { type: 'READY' } })); }, terminate: () => { ++terminated; } }; workers.push(w); return w; },
    makeBitmap: async () => ({ close() {} }), clock: () => now,
    requestFrame: cb => { frames.set(++id, cb); return id; }, cancelFrame: n => frames.delete(n), ...overrides });
  const fire = () => { const [key, cb] = frames.entries().next().value; frames.delete(key); cb(); };
  return { ...f, vision, frames, workers, video, fire, setClock: t => { now = t; }, stats: () => ({ stops, terminated }) };
}

test('camera lifecycle loads a Worker, releases tracks and can restart', async () => {
  const f = cameraFixture(); await f.vision.start();
  assert.equal(f.state.cameraReady, true);
  assert.equal(f.workers.length, 1);
  f.vision.stop();
  assert.equal(f.video.srcObject, null);
  assert.equal(f.frames.size, 0);
  assert.deepEqual(f.stats(), { stops: 1, terminated: 1 });
  await f.vision.start(); f.vision.dispose();
  assert.deepEqual(f.stats(), { stops: 2, terminated: 2 });
  assert.equal(f.state.leftHandBound, false);
});

test('cancel while permission is pending stops a stream granted later', async () => {
  let resolve, stops = 0;
  const f = cameraFixture({ media: { getUserMedia: () => new Promise(r => { resolve = r; }) } });
  const pending = f.vision.start(); f.vision.stop();
  resolve({ getTracks: () => [{ stop: () => { ++stops; } }] });
  await pending;
  assert.equal(stops, 1);
  assert.equal(f.state.cameraReady, false);
  assert.equal(f.workers.length, 0);
});

test('permission rejection, Worker failure and bitmap failure clean up and permit retry', async () => {
  const rejected = cameraFixture({ media: { getUserMedia: async () => { throw Object.assign(new Error('denied'), { name: 'NotAllowedError' }); } } });
  await assert.rejects(rejected.vision.start());
  assert.match(rejected.state.cameraError, /permission/);
  const f = cameraFixture(); await f.vision.start();
  f.workers[0].onerror({ message: 'worker failed' });
  assert.equal(f.state.cameraPhase, 'error');
  assert.deepEqual(f.stats(), { stops: 1, terminated: 1 });
  await f.vision.start();
  f.vision.makeBitmap = () => { throw new Error('bitmap failed'); };
  f.fire(); await new Promise(r => setImmediate(r));
  assert.equal(f.state.cameraPhase, 'error');
  assert.deepEqual(f.stats(), { stops: 2, terminated: 2 });
});

test('one in-flight frame and stale-result guard prevent delayed gesture controls', async () => {
  const f = cameraFixture(); await f.vision.start();
  f.fire(); await new Promise(r => setImmediate(r));
  assert.equal(f.vision.pendingFrame, true);
  f.video.currentTime = 2; f.setClock(100); f.fire();
  assert.equal(f.vision.lastVideoTime, 1);
  f.setClock(config.visionMaxGapMs + 1);
  f.workers[0].onmessage({ data: { type: 'RESULT', result: result(hand()), inferenceMs: 1 } });
  assert.equal(f.state.detectedHands, 0);
  assert.equal(f.vision.pendingFrame, false);
  f.vision.dispose();
});

test('gesture-to-music integration preserves pause/resume lifecycle and exports vision events', async () => {
  const state = createState(); Object.assign(state, { cameraReady: true, audioReady: true });
  const serial = new ConductorSession({ state });
  const calls = [];
  const music = new MusicSession({ state, unlock: async () => {}, loadScore: async () => ({ bars: 1, tracks: [], notes: [], ppq: 480 }),
    createPlayer: () => ({ snapshot: () => ({ playbackState: state.playbackState, progress: .4, bar: 1, beat: 2, tick: 700 }),
      play: () => { state.playbackState = 'playing'; calls.push('play'); },
      pause: () => { state.playbackState = 'paused'; calls.push('pause'); },
      setTempo() {}, setVolume() {}, stop() {}, dispose() {} }),
    onEvent: (k, d) => serial.recordMusicEvent(k, d) });
  await music.play();
  let now = 0;
  const control = new HandControl({ state, music, clock: () => now, onEvent: (k, d) => serial.recordVisionEvent(k, d) });
  for (now = 0; now <= 700; now += 100) control.process(result(hand()), now);
  now = 700; control.bindLeft();
  for (now = 800; now <= 1400; now += 100) control.process(result(hand('Left', .5, 'Closed_Fist')), now);
  for (now = 1500; now <= 2100; now += 100) control.process(result(hand('Left', .5, 'Open_Palm')), now);
  await new Promise(r => setImmediate(r));
  assert.deepEqual(calls, ['play', 'pause', 'play']);
  assert.match(serial.exportCsv(), /HOST_VISION/);
  assert.match(serial.exportCsv(), /VISION,BIND_LEFT/);
  assert.match(serial.exportCsv(), /VISION,PAUSE/);
  assert.match(serial.exportCsv(), /VISION,RESUME/);
  music.dispose();
});
