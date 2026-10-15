import * as Tone from 'tone';
import { Midi } from '@tonejs/midi';
import { config } from './config.js';
import { compileScore } from './midi-score.js';
import { MusicPlayer } from './music-player.js';
import { MusicSession } from './music-session.js';
import { ToneBackend } from './sound-backend.js';
export { ToneBackend } from './sound-backend.js';

export function createMusicSession(state, { onEvent = () => {} } = {}) {
  return new MusicSession({ state, onEvent, unlock: () => Tone.start(),
    loadScore: async ({ signal }) => {
      const response = await fetch(config.midiUrl, { signal: AbortSignal.any([signal, AbortSignal.timeout(10000)]) });
      if (!response.ok) throw new Error(`Local MIDI request failed (${response.status}).`);
      return compileScore(new Midi(await response.arrayBuffer()));
    },
    createPlayer: score => new MusicPlayer({ score, backend: new ToneBackend(score, { soundProfile: state.soundProfile }) }) });
}
