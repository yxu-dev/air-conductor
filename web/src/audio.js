import * as Tone from 'tone';
import { Midi } from '@tonejs/midi';
import { config } from './config.js';
import { compileScore } from './midi-score.js';
import { MusicPlayer } from './music-player.js';
import { MusicSession } from './music-session.js';

const frequency = midi => 440 * 2 ** ((midi - 69) / 12);

export class ToneBackend {
  constructor(score, { context = Tone.getContext(), destination = context.destination } = {}) {
    Object.assign(this, { score, context });
    this.transport = context.transport;
    this.voices = new Map();
    this.limiter = new Tone.Limiter({ context, threshold: -1 }).connect(destination);
    this.gate = new Tone.Gain({ context, gain: 0 }).connect(this.limiter);
    this.volume = new Tone.Volume({ context, volume: config.defaultVolumeDb }).connect(this.gate);
  }

  immediate() { return this.context.currentTime; }
  startTime() { return this.context.now(); }

  createVoices() {
    this.destroyVoices();
    for (const track of this.score.tracks) {
      const synth = new Tone.PolySynth({ context: this.context, voice: Tone.Synth,
        options: { oscillator: { type: 'triangle' },
          envelope: { attack: .01, decay: .12, sustain: .4, release: .035 } } });
      synth.connect(this.volume);
      this.voices.set(track.trackIndex, synth);
    }
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
  destroyVoices() { for (const synth of this.voices.values()) synth.dispose(); this.voices.clear(); }
  dispose() { this.destroyVoices(); this.volume.dispose(); this.gate.dispose(); this.limiter.dispose(); }
}

export function createMusicSession(state, { onEvent = () => {} } = {}) {
  return new MusicSession({ state, onEvent, unlock: () => Tone.start(),
    loadScore: async ({ signal }) => {
      const response = await fetch(config.midiUrl, { signal: AbortSignal.any([signal, AbortSignal.timeout(10000)]) });
      if (!response.ok) throw new Error(`Local MIDI request failed (${response.status}).`);
      return compileScore(new Midi(await response.arrayBuffer()));
    },
    createPlayer: score => new MusicPlayer({ score, backend: new ToneBackend(score) }) });
}
