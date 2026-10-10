import { config } from './config.js';
import { heldNotes } from './midi-score.js';

export class MusicPlayer {
  constructor({ score, backend }) {
    Object.assign(this, { score, backend });
    this.state = 'stopped';
    this.pausedTick = 0;
    this.disposed = false;
    this.tempo = config.defaultBpm;
    this.ids = [];
    const transport = backend.transport;
    transport.PPQ = score.ppq;
    transport.loopStart = '0i';
    transport.loopEnd = `${score.loopTicks}i`;
    transport.loop = true;
    this.loopEnd = time => { if (this.state === 'playing') backend.releaseAtLoop(time); };
    transport.on('loopEnd', this.loopEnd);
    for (const event of score.events) {
      this.ids.push(transport.schedule(time => {
        if (this.disposed || this.state !== 'playing') return;
        // Note-offs precede adjacent note-ons at the same tick.
        for (const note of event.releases) backend.release(note, time);
        for (const note of event.attacks) backend.attack(note, time);
      }, `${event.tick}i`));
    }
    backend.mute(true, backend.immediate());
    this.setTempo(this.tempo);
  }

  play() {
    if (this.disposed) throw new Error('音乐播放器已关闭。');
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
    this.pausedTick = this.positionAt(time);
    this.state = 'paused';
    this.backend.transport.pause(time);
    this.silence(time);
  }

  stop() {
    if (this.disposed) return;
    this.state = 'stopped';
    this.pausedTick = 0;
    const time = this.backend.immediate();
    this.backend.transport.stop(time);
    this.silence(time);
  }

  silence(time) {
    this.backend.mute(true, time);
    // Disposing voices also cancels attacks already queued inside Tone's lookahead.
    this.backend.destroyVoices();
  }

  setTempo(bpm) {
    if (!Number.isFinite(bpm)) throw new Error('音乐速度必须是有效数值。');
    const value = Math.min(config.maxBpm, Math.max(config.minBpm, bpm));
    const parameter = this.backend.transport.bpm;
    if (this.state === 'playing') parameter.rampTo(value, config.tempoRampSeconds);
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
    const tick = this.state === 'playing' ? this.positionAt(this.backend.immediate()) : this.pausedTick;
    return { playbackState: this.state, progress: tick / this.score.loopTicks,
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
