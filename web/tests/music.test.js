import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import midiPackage from '@tonejs/midi';
import { TransportTimeClass } from '../node_modules/tone/build/esm/core/type/TransportTime.js';
import { compileScore, heldNotes } from '../src/midi-score.js';
import { MusicPlayer } from '../src/music-player.js';
import { MusicSession } from '../src/music-session.js';
import { createState } from '../src/state.js';
import { ConductorSession } from '../src/session.js';
import { FakePort, FakeSerial, until } from './fake-serial.js';

function score(notes = [{ ticks: 0, durationTicks: 960, midi: 60, velocity: .7 },
  { ticks: 960, durationTicks: 480, midi: 60, velocity: .8 }]) {
  return compileScore({ header: { ppq: 480, timeSignatures: [{ timeSignature: [4, 4] }], tempos: [{ bpm: 100 }] },
    durationTicks: 1920, tracks: [{ notes, instrument: { percussion: false } }] });
}

class FakeBackend {
  constructor() {
    this.time = 0;
    this.tick = 0;
    this.calls = [];
    this.events = new Map();
    this.handlers = new Map();
    this.transport = {
      bpm: { value: 100, rampTo: (value, duration) => this.calls.push(['tempo', value, duration]) },
      schedule: (callback, position) => { const id = this.events.size + 1; this.events.set(id, { callback, tick: Number.parseInt(position) }); return id; },
      clear: id => this.events.delete(id),
      on: (kind, handler) => this.handlers.set(kind, handler),
      off: kind => this.handlers.delete(kind),
      getTicksAtTime: () => this.tick,
      start: (time, position) => { if (position !== undefined) this.tick = new TransportTimeClass({ transport: this.transport }, position).toTicks(); this.status = 'started'; this.calls.push(['start', time, position]); },
      pause: time => { this.status = 'paused'; this.calls.push(['pause', time]); },
      stop: time => { this.status = 'stopped'; this.tick = 0; this.calls.push(['stop', time]); },
    };
  }
  immediate() { return this.time; }
  startTime() { return this.time + .1; }
  createVoices() { this.calls.push(['create']); }
  destroyVoices() { this.calls.push(['destroy']); }
  attack(note, time) { this.calls.push(['attack', note.midi, time]); }
  release(note, time) { this.calls.push(['release', note.midi, time]); }
  releaseAtLoop(time) { this.calls.push(['loop-release', time]); }
  mute(value, time) { this.calls.push(['mute', value, time]); }
  setVolume(db) { this.calls.push(['volume', db]); }
  dispose() { this.calls.push(['dispose']); }
  fire(tick) { if (this.status === 'started') this.tick = tick; for (const event of this.events.values()) if (event.tick === tick) event.callback(this.time); }
}

test('real local MIDI compiles both melodic voices and a complete 16-bar loop', () => {
  const midi = new midiPackage.Midi(readFileSync(new URL('../public/midi/ode.mid', import.meta.url)));
  const result = compileScore(midi);
  assert.equal(result.ppq, 384);
  assert.equal(result.loopTicks, 24576);
  assert.equal(result.bars, 16);
  assert.equal(result.tracks.length, 2);
  assert.equal(result.notes.length, 238);
  assert.ok(result.notes.every(note => note.endTick <= result.loopTicks));
});

test('same-pitch overlaps merge, adjacent notes retrigger and percussion is excluded', () => {
  const result = score([{ ticks: 0, durationTicks: 800, midi: 60, velocity: .5 },
    { ticks: 400, durationTicks: 560, midi: 60, velocity: .8 },
    { ticks: 960, durationTicks: 480, midi: 60, velocity: .7 }]);
  assert.equal(result.notes.length, 2);
  assert.equal(result.notes[0].endTick, 960);
  assert.equal(result.notes[0].velocity, .8);
  assert.equal(heldNotes(result, 500).length, 1);
  assert.equal(heldNotes(result, 960).length, 0);
  const drumOnly = { header: { ppq: 480 }, tracks: [{ instrument: { percussion: true }, notes: [] }] };
  assert.throws(() => compileScore(drumOnly), /no playable/);
  assert.throws(() => score([{ ticks: 0, durationTicks: -1, midi: 60, velocity: .5 }]), /invalid note/);
});

test('musical note-offs precede adjacent attacks and changing BPM never restarts playback', () => {
  const backend = new FakeBackend();
  const player = new MusicPlayer({ score: score(), backend });
  player.play(); backend.fire(0); backend.calls.length = 0;
  backend.fire(960);
  assert.deepEqual(backend.calls.map(call => call[0]), ['release', 'attack']);
  backend.calls.length = 0;
  player.setTempo(160);
  assert.equal(backend.tick, 960);
  assert.deepEqual(backend.calls, [['tempo', 160, .08]]);
  assert.equal(player.snapshot().bar, 1);
  assert.equal(player.snapshot().beat, 3);
  player.dispose();
});

test('pause cancels voices immediately; resume retains the audible tick and restores held notes', () => {
  const backend = new FakeBackend();
  const player = new MusicPlayer({ score: score(), backend });
  player.play(); backend.fire(0); backend.tick = 600.75; backend.time = 3;
  player.pause();
  assert.equal(player.snapshot().tick, 600.75);
  assert.deepEqual(backend.calls.slice(-3), [['pause', 3], ['mute', true, 3], ['destroy']]);
  backend.calls.length = 0; backend.fire(960);
  assert.equal(backend.calls.length, 0);
  player.play();
  assert.ok(backend.calls.some(call => call[0] === 'attack' && call[1] === 60));
  assert.ok(backend.calls.some(call => call[0] === 'start' && call[2] === undefined));
  assert.equal(player.snapshot().tick, 600.75);
  player.stop(); assert.equal(player.snapshot().tick, 0);
  player.dispose();
  assert.equal(backend.events.size, 0);
  assert.equal(backend.handlers.size, 0);
});

test('last notes release at loopEnd before restarting tick zero', () => {
  const backend = new FakeBackend();
  const player = new MusicPlayer({ score: score([{ ticks: 0, durationTicks: 1920, midi: 69, velocity: 1 }]), backend });
  assert.ok([...backend.events.values()].every(event => event.tick !== 1920));
  player.play(); backend.fire(0); backend.calls.length = 0;
  backend.handlers.get('loopEnd')(4); backend.fire(0);
  assert.equal(backend.calls[0][0], 'loop-release');
  assert.equal(backend.calls[1][0], 'attack');
  player.dispose();
});

function setupSession(options = {}) {
  const state = createState();
  const backend = new FakeBackend();
  let unlocks = 0;
  const session = new MusicSession({ state, loadScore: async () => score(),
    unlock: async () => { unlocks += 1; }, createPlayer: value => new MusicPlayer({ score: value, backend }), ...options });
  return { session, state, backend, unlocks: () => unlocks };
}

test('response switching preserves music position, uses the selected ramp and holds tempo while remeasuring', async () => {
  const { session: music, state, backend } = setupSession();
  const conductor = new ConductorSession({ state, serial: new FakeSerial(new FakePort()), clock: () => 6000 });
  Object.assign(state, { serialPhase: 'connected', calibrationState: 'ready', detectionActive: true,
    receivedBeatCount: 13, measuredBpm: 120, tempoStatus: 'tracking', tempoIntervals: 3 });
  for (let at = 0; at <= 6000; at += 500) conductor.tempo.add(at, at);
  music.setSource('conducting');
  await music.play(); backend.tick = 700.5; backend.calls.length = 0;
  conductor.setControlResponse('classic'); music.tick();
  assert.equal(state.musicBpm, 120);
  assert.equal(state.tempoFollowStatus, 'measuring');
  assert.equal(state.receivedBeatCount, 13);
  assert.equal(state.detectionActive, true);
  assert.equal(conductor.tempo.anchor, null);
  assert.deepEqual(backend.calls, []);
  assert.equal(backend.tick, 700.5);
  assert.ok(conductor.exportCsv().includes('classic'));
  Object.assign(state, { measuredBpm: 90, tempoStatus: 'tracking', tempoIntervals: 3 });
  music.tick();
  assert.deepEqual(backend.calls, [['tempo', 90, .2]]);
  conductor.setControlResponse('responsive'); music.tick();
  Object.assign(state, { measuredBpm: 100, tempoStatus: 'tracking', tempoIntervals: 3 });
  music.tick();
  assert.deepEqual(backend.calls.at(-1), ['tempo', 100, .08]);
  music.pause(); const paused = backend.tick;
  conductor.setControlResponse('classic'); music.tick();
  assert.equal(state.playbackState, 'paused');
  assert.equal(backend.tick, paused);
  assert.throws(() => conductor.setControlResponse('invalid'), /Unknown/);
  assert.equal(state.controlResponse, 'classic');
  music.dispose();
});

test('preloading is silent; manual/follow sources are independent and idle/disconnect hold tempo', async () => {
  const { session, state, backend, unlocks } = setupSession();
  await session.load();
  assert.equal(unlocks(), 0);
  assert.equal(state.audioReady, false);
  assert.equal(backend.events.size, 0);
  session.setManualBpm(80);
  Object.assign(state, { serialPhase: 'connected', calibrationState: 'ready', detectionActive: true,
    measuredBpm: 120, tempoStatus: 'tracking', tempoIntervals: 5 });
  session.tick(); assert.equal(state.musicBpm, 80);
  await session.play();
  session.setSource('conducting'); assert.equal(state.musicBpm, 120);
  state.tempoStatus = 'idle'; state.measuredBpm = 150;
  session.tick(); assert.equal(state.musicBpm, 120);
  assert.equal(state.tempoFollowStatus, 'holding');
  state.serialPhase = 'disconnected'; session.tick();
  assert.equal(state.musicBpm, 120);
  assert.equal(state.playbackState, 'playing');
  session.setSource('manual'); assert.equal(state.musicBpm, 80);
  session.pause(); assert.equal(state.playbackState, 'paused');
  session.dispose();
});

test('stopping while audio unlock is pending prevents late playback', async () => {
  let resolveUnlock;
  const { session, state, backend } = setupSession({ unlock: () => new Promise(resolve => { resolveUnlock = resolve; }) });
  const playing = session.play();
  assert.equal(state.audioBusy, true);
  session.stop(); resolveUnlock(); await playing;
  assert.equal(state.audioBusy, false);
  assert.equal(state.playbackState, 'stopped');
  assert.equal(backend.events.size, 0);
  session.dispose();
});

test('failed MIDI load can retry and disposed pending loads cannot create a player', async () => {
  let attempts = 0;
  const { session, state } = setupSession({ loadScore: async () => { if (++attempts === 1) throw new Error('network'); return score(); } });
  await assert.rejects(session.load(), /network/);
  assert.equal(state.musicLoadState, 'error');
  await session.load(); assert.equal(state.musicLoadState, 'ready');
  session.dispose();
  let resolveLoad;
  const pending = setupSession({ loadScore: () => new Promise(resolve => { resolveLoad = resolve; }) });
  const loading = pending.session.load(); pending.session.dispose(); resolveLoad(score()); await loading;
  assert.equal(pending.state.midiLoaded, false);
  assert.equal(pending.backend.events.size, 0);
});

test('serial BEAT frames drive music tempo without restarting playback; detection stop holds it', async () => {
  let conductor;
  let now = 0;
  const { session: music, state, backend } = setupSession({ onEvent: (kind, data) => conductor.recordMusicEvent(kind, data) });
  const port = new FakePort((command, device) => {
    if (command === 'STATUS') device.feed('STATUS,UNCALIBRATED\n');
    else if (command === 'CALIBRATE') device.feed('DETECT,OFF\nSTATUS,CALIBRATING\nCALIBRATION,0,0,-9.8,0,0,0,0.01,0.001\nREADY\n');
    else device.feed(command + '\n');
  });
  conductor = new ConductorSession({ state, serial: new FakeSerial(port), clock: () => now,
    startupMs: 0, preparationMs: 0, onBeat: () => music.tick() });
  await conductor.connect(); await until(() => state.serialPhase === 'connected');
  await conductor.calibrate(); await conductor.setDetection(true);
  music.setSource('conducting'); await music.play();
  for (let i = 0; i < 12; i++) {
    now = i * 500; port.feed(`BEAT,${i * 500},0.5\n`);
    await until(() => state.receivedBeatCount === i + 1);
  }
  assert.equal(state.measuredBpm, 120);
  assert.equal(state.musicBpm, 120);
  assert.equal(state.playbackState, 'playing');
  assert.equal(backend.calls.filter(call => call[0] === 'start').length, 1);
  assert.ok(backend.calls.some(call => call[0] === 'tempo' && call[1] === 120));
  assert.ok(conductor.exportCsv().includes('MUSIC,TEMPO'));
  await conductor.setDetection(false); music.tick();
  assert.equal(state.musicBpm, 120);
  assert.equal(state.tempoFollowStatus, 'waiting');
  await conductor.transport.dispose(); music.dispose();
});
