import { config } from './config.js';
import { heldNotes } from './midi-score.js';
import { soundSettings } from './sound-profiles.js';

export class MusicPlayer {
  constructor({ score, backend }) {
    Object.assign(this, { score, backend });
    this.state = 'stopped';
    this.pausedTick = 0;
    this.coronaActive = false;
    this.frozenTick = 0;
    this.disposed = false;
    this.tempo = config.defaultBpm;
    this.ids = [];
    const transport = backend.transport;
    transport.PPQ = score.ppq;
    transport.loopStart = '0i';
    transport.loopEnd = `${score.loopTicks}i`;
    transport.loop = true;
    this.loopEnd = time => { if (this.state === 'playing' && !this.coronaActive) backend.releaseAtLoop(time); };
    transport.on('loopEnd', this.loopEnd);
    for (const event of score.events) {
      this.ids.push(transport.schedule(time => {
        if (this.disposed || this.state !== 'playing' || this.coronaActive) return;
        // Note-offs precede adjacent note-ons at the same tick.
        for (const note of event.releases) backend.release(note, time);
        for (const note of event.attacks) backend.attack(note, time);
      }, `${event.tick}i`));
    }
    backend.mute(true, backend.immediate());
    this.setTempo(this.tempo);
  }

  play() {
    if (this.disposed) throw new Error('The music player has been closed.');
    if (this.state === 'playing') return;
    const offset = this.state === 'paused' ? this.pausedTick : 0;
    this.backend.createVoices();
    const time = this.backend.startTime();
    this.state = 'playing';
    this.backend.mute(false, time);
    for (const note of heldNotes(this.score, offset)) this.backend.attack(note, time);
    // Tone's "Ni" syntax accepts integer ticks only. The paused clock retains
    // fractional ticks exactly; resume without reparsing an offset string.
    if (offset === 0) this.backend.transport.start(time, '0i');
    else this.backend.transport.start(time);
  }

  pause() {
    if (this.state !== 'playing') return;
    const time = this.backend.immediate();
    this.pausedTick = this.coronaActive ? this.frozenTick : this.positionAt(time);
    this.coronaActive = false;
    this.state = 'paused';
    this.backend.transport.pause(time);
    this.silence(time);
  }

  stop() {
    if (this.disposed) return;
    this.state = 'stopped';
    this.pausedTick = 0;
    this.coronaActive = false;
    const time = this.backend.immediate();
    this.backend.transport.stop(time);
    this.silence(time);
  }

  silence(time) {
    this.backend.mute(true, time);
    // Disposing voices also cancels attacks already queued inside Tone's lookahead.
    this.backend.destroyVoices();
    this.backend.clearHold();
    this.backend.clearEffects();
  }

  setSoundProfile(profile) {
    soundSettings(profile);
    if (this.disposed) throw new Error('The music player has been closed.');
    this.backend.setSoundProfile(profile);
  }

  enterCorona() {
    if (this.disposed || this.state !== 'playing' || this.coronaActive) return false;
    const time = this.backend.immediate();
    this.frozenTick = this.positionAt(time);
    this.coronaActive = true;
    this.backend.transport.pause(time);
    // Include exact note starts for the hold; resume scheduling owns that boundary.
    const notes = this.score.notes.filter(note => note.startTick <= this.frozenTick && note.endTick > this.frozenTick);
    this.backend.startHold(notes, time);
    return true;
  }

  exitCorona() {
    if (this.disposed || !this.coronaActive || this.state !== 'playing') return false;
    this.backend.createVoices();
    const time = this.backend.immediate();
    for (const note of heldNotes(this.score, this.frozenTick)) this.backend.attack(note, time);
    this.backend.endHold(time);
    this.coronaActive = false;
    // Preserve Tone's fractional paused clock, including tick zero at a loop boundary.
    this.backend.transport.start(time);
    return true;
  }

  setTempo(bpm, rampSeconds = config.tempoRampSeconds) {
    if (!Number.isFinite(bpm)) throw new Error('Tempo must be a finite number.');
    const value = Math.min(config.maxBpm, Math.max(config.minBpm, bpm));
    const parameter = this.backend.transport.bpm;
    if (this.state === 'playing' && !this.coronaActive) parameter.rampTo(value, rampSeconds);
    else parameter.value = value;
    this.tempo = value;
    return value;
  }

  setVolume(db) { this.backend.setVolume(db); }

  positionAt(time) {
    const tick = this.backend.transport.getTicksAtTime(time);
    return ((tick % this.score.loopTicks) + this.score.loopTicks) % this.score.loopTicks;
  }

  snapshot() {
    const tick = this.coronaActive ? this.frozenTick : this.state === 'playing' ? this.positionAt(this.backend.immediate()) : this.pausedTick;
    return { playbackState: this.state, coronaActive: this.coronaActive, progress: tick / this.score.loopTicks,
      bar: Math.floor(tick / this.score.barTicks) + 1,
      beat: Math.floor((tick % this.score.barTicks) / (this.score.barTicks / this.score.beatsPerBar)) + 1,
      tick };
  }

  dispose() {
    if (this.disposed) return;
    this.stop();
    this.disposed = true;
    this.backend.transport.off('loopEnd', this.loopEnd);
    for (const id of this.ids) this.backend.transport.clear(id);
    this.backend.dispose();
  }
}
