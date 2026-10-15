import * as Tone from 'tone';
import { config } from './config.js';
import { soundSettings, trackSound, performedVelocity } from './sound-profiles.js';

const frequency = midi => 440 * 2 ** ((midi - 69) / 12);
const voices = { Synth: Tone.Synth, MonoSynth: Tone.MonoSynth, DuoSynth: Tone.DuoSynth, FMSynth: Tone.FMSynth };
const legacy = profile => ['classic', 'ensemble'].includes(profile);

export class ToneBackend {
  constructor(score, { context = Tone.getContext(), destination = context.destination,
    soundProfile = config.defaultSoundProfile } = {}) {
    soundSettings(soundProfile);
    Object.assign(this, { score, context, soundProfile });
    this.transport = context.transport;
    this.normalBank = this.holdBank = null;
    this.voices = new Map(); this.holdVoices = new Map(); this.holdGates = new Map();
    this.retiring = new Set(); this.pendingEvents = [];
    this.disposed = false;
    this.limiter = new Tone.Limiter({ context, threshold: -1 }).connect(destination);
    this.gate = new Tone.Gain({ context, gain: 0 }).connect(this.limiter);
    this.volume = new Tone.Volume({ context, volume: config.defaultVolumeDb }).connect(this.gate);
    this.mix = new Tone.Gain({ context, gain: 1 });
    this.createAmbience();
    this.paths = new Map();
    for (const [index, track] of score.tracks.entries()) {
      const spec = trackSound(soundProfile, index);
      const input = new Tone.Gain({ context, gain: 1 });
      const direct = new Tone.Gain({ context, gain: spec.bypassFilter ? 1 : 0 }).connect(this.mix);
      const filtered = new Tone.Gain({ context, gain: spec.bypassFilter ? 0 : 1 }).connect(this.mix);
      const filter = new Tone.Filter({ context, type: 'lowpass', frequency: spec.cutoff, Q: .5 }).connect(filtered);
      input.connect(direct); input.connect(filter);
      this.paths.set(track.trackIndex, { index, input, direct, filtered, filter });
    }
  }
  immediate() { return this.context.currentTime; }
  startTime() { return this.context.now(); }

  makeBank(kind, profile, gain = 1) {
    const bank = { kind, profile, voices: new Map(), gates: new Map(), timer: null, resolve: null };
    try {
      for (const [id, path] of this.paths) {
        const spec = trackSound(profile, path.index), Voice = voices[spec.voice];
        if (!Voice) throw new Error('Unsupported sound voice.');
        const gate = new Tone.Gain({ context: this.context, gain }).connect(path.input);
        bank.gates.set(id, gate);
        // Tone mutates nested voice options; each bank owns an independent copy.
        const synth = new Tone.PolySynth({ context: this.context, voice: Voice,
          volume: spec.volume, maxPolyphony: spec.maxPolyphony, options: structuredClone(spec.options) });
        bank.voices.set(id, synth); synth.connect(gate);
      }
      return bank;
    } catch (error) { this.disposeBank(bank); throw error; }
  }
  disposeBank(bank) {
    if (!bank) return;
    if (bank.timer !== null) clearTimeout(bank.timer);
    bank.timer = null;
    for (const gate of bank.gates.values()) { gate.gain.cancelScheduledValues(this.immediate()); gate.gain.value = 0; gate.dispose(); }
    for (const synth of bank.voices.values()) synth.dispose();
    bank.gates.clear(); bank.voices.clear(); this.retiring.delete(bank);
    bank.resolve?.(); bank.resolve = null;
  }
  retireBank(bank, time, duration) {
    if (!bank) return;
    this.retiring.add(bank);
    for (const gate of bank.gates.values()) {
      gate.gain.cancelAndHoldAtTime(time);
      gate.gain.linearRampToValueAtTime(0, time + duration);
    }
    // Offline scheduling runs before rendering. Keep silent nodes until dispose,
    // otherwise destroying them here would erase their earlier rendered sound.
    if (this.context.isOffline) return;
    return new Promise(resolve => {
      bank.resolve = resolve;
      bank.timer = setTimeout(() => this.disposeBank(bank), Math.max(0, (time + duration - this.immediate()) * 1000) + 30);
    });
  }
  createVoices() {
    this.destroyVoices();
    this.normalBank = this.makeBank('normal', this.soundProfile);
    this.voices = this.normalBank.voices;
  }
  createAmbience() {
    const settings = soundSettings(this.soundProfile).effects;
    this.ambience = new Tone.FeedbackDelay({ context: this.context, delayTime: .065, feedback: .15,
      wet: settings.delayWet }).connect(this.volume);
    this.chorus = new Tone.Chorus({ context: this.context, frequency: 1.5, delayTime: 3.5,
      depth: .35, feedback: 0, wet: settings.chorusWet }).connect(this.ambience).start();
    this.mix.connect(this.chorus);
  }
  clearEffects() {
    this.mix.disconnect(this.chorus); this.chorus.dispose(); this.ambience.dispose(); this.createAmbience();
  }
  applyPaths(profile) {
    for (const path of this.paths.values()) {
      const spec = trackSound(profile, path.index);
      path.direct.gain.rampTo(spec.bypassFilter ? 1 : 0, .06);
      path.filtered.gain.rampTo(spec.bypassFilter ? 0 : 1, .06);
      path.filter.frequency.rampTo(spec.cutoff, .06);
    }
    const settings = soundSettings(profile).effects;
    this.chorus.wet.rampTo(settings.chorusWet, .06); this.ambience.wet.rampTo(settings.delayWet, .06);
  }
  setSoundProfile(profile, { mode = 'stopped', notes = [] } = {}) {
    soundSettings(profile);
    if (this.disposed) throw new Error('The sound engine has been closed.');
    if (profile === this.soundProfile) return;
    if (legacy(profile) && legacy(this.soundProfile)) {
      for (const bank of [this.normalBank, this.holdBank].filter(Boolean)) {
        for (const [id, synth] of bank.voices) {
          const spec = trackSound(profile, this.paths.get(id).index);
          synth.set(structuredClone(spec.options)); synth.volume.rampTo(spec.volume, .06);
        }
        bank.profile = profile;
      }
      this.soundProfile = profile; this.applyPaths(profile); return;
    }
    const holding = mode === 'corona';
    const old = holding ? this.holdBank : this.normalBank;
    if (!old || !['playing', 'corona'].includes(mode)) {
      this.soundProfile = profile; this.applyPaths(profile); return;
    }
    const next = this.makeBank(holding ? 'hold' : 'normal', profile, 0);
    const time = this.immediate();
    try {
      for (const note of notes) this.emit(next, { kind: 'attack', note, time });
      if (!holding) {
        this.pruneEvents(time);
        // Rebuild already-issued future events as well as currently sounding notes.
        for (const event of this.pendingEvents) this.emit(next, event);
      }
    } catch (error) { this.disposeBank(next); throw error; }
    if (holding) { this.holdBank = next; this.holdVoices = next.voices; this.holdGates = next.gates; }
    else { this.normalBank = next; this.voices = next.voices; }
    this.soundProfile = profile; this.applyPaths(profile);
    for (const gate of next.gates.values()) gate.gain.linearRampToValueAtTime(1, time + .08);
    return this.retireBank(old, time, .08);
  }
  emit(bank, event) {
    if (!bank) return;
    if (event.kind === 'loop') {
      for (const track of this.score.tracks) bank.voices.get(track.trackIndex)?.triggerRelease(track.pitches.map(frequency), event.time);
    } else {
      const synth = bank.voices.get(event.note.trackIndex);
      if (event.kind === 'attack') {
        const spec = trackSound(bank.profile, this.paths.get(event.note.trackIndex).index);
        synth?.triggerAttack(frequency(event.note.midi), event.time, performedVelocity(event.note, this.score, spec));
      } else synth?.triggerRelease(frequency(event.note.midi), event.time);
    }
  }
  pruneEvents(time = this.immediate()) { this.pendingEvents = this.pendingEvents.filter(event => event.time >= time); }
  scheduled(event) {
    this.pruneEvents(); this.pendingEvents.push(event); this.emit(this.normalBank, event);
    // Note-offs also reach fading sources, so a short note cannot ring through the fade.
    if (event.kind !== 'attack') for (const bank of this.retiring) if (bank.kind === 'normal') this.emit(bank, event);
  }
  attack(note, time) { this.scheduled({ kind: 'attack', note, time }); }
  release(note, time) { this.scheduled({ kind: 'release', note, time }); }
  releaseAtLoop(time) { this.scheduled({ kind: 'loop', time }); }
  mute(muted, time) { this.gate.gain.cancelScheduledValues(time); this.gate.gain.setValueAtTime(muted ? 0 : 1, time); }
  setVolume(db) { this.volume.volume.rampTo(db, .05); }
  startHold(notes, time) {
    this.destroyVoices(); this.clearHold();
    this.holdBank = this.makeBank('hold', this.soundProfile);
    this.holdVoices = this.holdBank.voices; this.holdGates = this.holdBank.gates;
    for (const note of notes) this.emit(this.holdBank, { kind: 'attack', note, time });
  }
  endHold(time) {
    if (!this.holdBank) return;
    const old = this.holdBank;
    for (const synth of old.voices.values()) synth.releaseAll(time);
    this.holdBank = null; this.holdVoices = new Map(); this.holdGates = new Map();
    this.retireBank(old, time, legacy(this.soundProfile) ? .01 : .08);
  }
  clearHold() {
    this.disposeBank(this.holdBank); this.holdBank = null;
    for (const bank of [...this.retiring]) if (bank.kind === 'hold') this.disposeBank(bank);
    this.holdVoices = new Map(); this.holdGates = new Map();
  }
  destroyVoices() {
    this.disposeBank(this.normalBank); this.normalBank = null;
    for (const bank of [...this.retiring]) if (bank.kind === 'normal') this.disposeBank(bank);
    this.voices = new Map(); this.pendingEvents = [];
  }
  dispose() {
    if (this.disposed) return;
    this.disposed = true; this.destroyVoices(); this.clearHold();
    for (const path of this.paths.values()) for (const key of ['input', 'direct', 'filtered', 'filter']) path[key].dispose();
    this.paths.clear(); this.mix.dispose(); this.chorus.dispose(); this.ambience.dispose(); this.volume.dispose(); this.gate.dispose(); this.limiter.dispose();
  }
}
