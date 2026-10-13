import * as Tone from 'tone';
import { Midi } from '@tonejs/midi';
import { config } from './config.js';
import { compileScore } from './midi-score.js';
import { MusicPlayer } from './music-player.js';
import { MusicSession } from './music-session.js';
import { soundSettings, trackSound } from './sound-profiles.js';

const frequency = midi => 440 * 2 ** ((midi - 69) / 12);

export class ToneBackend {
  constructor(score, { context = Tone.getContext(), destination = context.destination,
    soundProfile = config.defaultSoundProfile } = {}) {
    soundSettings(soundProfile);
    Object.assign(this, { score, context, soundProfile });
    this.transport = context.transport;
    this.voices = new Map();
    this.holdVoices = new Map();
    this.limiter = new Tone.Limiter({ context, threshold: -1 }).connect(destination);
    this.gate = new Tone.Gain({ context, gain: 0 }).connect(this.limiter);
    this.volume = new Tone.Volume({ context, volume: config.defaultVolumeDb }).connect(this.gate);
    this.mix = new Tone.Gain({ context, gain: 1 });
    this.createAmbience();
    this.paths = new Map();
    for (const [index, track] of score.tracks.entries()) {
      const settings = trackSound(soundProfile, index);
      const input = new Tone.Gain({ context, gain: 1 });
      const direct = new Tone.Gain({ context, gain: soundProfile === 'classic' ? 1 : 0 }).connect(this.mix);
      const filtered = new Tone.Gain({ context, gain: soundProfile === 'ensemble' ? 1 : 0 }).connect(this.mix);
      const filter = new Tone.Filter({ context, type: 'lowpass', frequency: settings.cutoff, Q: .5 }).connect(filtered);
      input.connect(direct); input.connect(filter);
      this.paths.set(track.trackIndex, { index, input, direct, filtered, filter });
    }
    this.holdGates = new Map();
  }

  immediate() { return this.context.currentTime; }
  startTime() { return this.context.now(); }

  createVoices() {
    this.destroyVoices();
    this.createBank(this.voices);
  }

  createBank(bank, holding = false) {
    for (const track of this.score.tracks) {
      const path = this.paths.get(track.trackIndex);
      const { volume, cutoff, ...options } = trackSound(this.soundProfile, path.index);
      // Apply track gain once, at the same output used by live palette switches.
      const synth = new Tone.PolySynth({ context: this.context, voice: Tone.Synth,
        volume, options });
      if (holding) {
        // Separate per-track gates preserve instrument routing during Corona.
        const gate = new Tone.Gain({ context: this.context, gain: 0 }).connect(path.input);
        synth.connect(gate); this.holdGates.set(track.trackIndex, gate);
      } else synth.connect(path.input);
      bank.set(track.trackIndex, synth);
    }
  }

  createAmbience() {
    // A short, quiet native delay adds space without convolution or worklets.
    this.ambience = new Tone.FeedbackDelay({ context: this.context, delayTime: .065,
      feedback: .15, wet: soundSettings(this.soundProfile).ambience }).connect(this.volume);
    this.mix.connect(this.ambience);
  }

  clearEffects() {
    this.mix.disconnect(this.ambience);
    this.ambience.dispose();
    this.createAmbience();
  }

  setSoundProfile(profile) {
    const settings = soundSettings(profile);
    if (profile === this.soundProfile) return;
    this.soundProfile = profile;
    for (const [trackIndex, path] of this.paths) {
      const { volume, cutoff, ...options } = trackSound(profile, path.index);
      path.direct.gain.rampTo(profile === 'classic' ? 1 : 0, .06);
      path.filtered.gain.rampTo(profile === 'ensemble' ? 1 : 0, .06);
      path.filter.frequency.rampTo(cutoff, .06);
      for (const bank of [this.voices, this.holdVoices]) {
        const synth = bank.get(trackIndex);
        // Update existing voices: queued note events and the musical clock survive.
        if (synth) { synth.set(options); synth.volume.rampTo(volume, .06); }
      }
    }
    this.ambience.wet.rampTo(settings.ambience, .06);
  }

  attack(note, time) { this.voices.get(note.trackIndex)?.triggerAttack(frequency(note.midi), time, note.velocity); }
  release(note, time) { this.voices.get(note.trackIndex)?.triggerRelease(frequency(note.midi), time); }

  releaseAtLoop(time) {
    for (const track of this.score.tracks) this.voices.get(track.trackIndex)?.triggerRelease(track.pitches.map(frequency), time);
  }

  mute(muted, time) {
    this.gate.gain.cancelScheduledValues(time);
    this.gate.gain.setValueAtTime(muted ? 0 : 1, time);
  }

  setVolume(db) { this.volume.volume.rampTo(db, .05); }
  startHold(notes, time) {
    // Discard queued normal attacks/releases before creating an unscheduled sustain.
    this.destroyVoices();
    this.clearHold();
    this.createBank(this.holdVoices, true);
    for (const gate of this.holdGates.values()) gate.gain.setValueAtTime(1, time);
    for (const note of notes) this.holdVoices.get(note.trackIndex)?.triggerAttack(frequency(note.midi), time, note.velocity);
  }
  endHold(time) {
    // A short handover fade bridges the reconstructed normal voice's attack.
    for (const gate of this.holdGates.values()) {
      gate.gain.cancelScheduledValues(time);
      gate.gain.setValueAtTime(1, time);
      gate.gain.linearRampToValueAtTime(0, time + .01);
    }
    for (const synth of this.holdVoices.values()) synth.releaseAll(time);
  }
  clearHold() {
    const time = this.immediate();
    for (const gate of this.holdGates.values()) {
      gate.gain.cancelScheduledValues(time);
      gate.gain.setValueAtTime(0, time); gate.dispose();
    }
    this.holdGates.clear();
    for (const synth of this.holdVoices.values()) synth.dispose();
    this.holdVoices.clear();
  }
  destroyVoices() { for (const synth of this.voices.values()) synth.dispose(); this.voices.clear(); }
  dispose() {
    this.destroyVoices(); this.clearHold();
    for (const path of this.paths.values()) { path.input.dispose(); path.direct.dispose(); path.filtered.dispose(); path.filter.dispose(); }
    this.paths.clear(); this.mix.dispose(); this.ambience.dispose(); this.volume.dispose(); this.gate.dispose(); this.limiter.dispose();
  }
}

export function createMusicSession(state, { onEvent = () => {} } = {}) {
  return new MusicSession({ state, onEvent, unlock: () => Tone.start(),
    loadScore: async ({ signal }) => {
      const response = await fetch(config.midiUrl, { signal: AbortSignal.any([signal, AbortSignal.timeout(10000)]) });
      if (!response.ok) throw new Error(`Local MIDI request failed (${response.status}).`);
      return compileScore(new Midi(await response.arrayBuffer()));
    },
    createPlayer: score => new MusicPlayer({ score, backend: new ToneBackend(score, { soundProfile: state.soundProfile }) }) });
}
