import { config } from './config.js';

export class MusicSession {
  constructor({ state, loadScore, unlock, createPlayer, onEvent = () => {} }) {
    Object.assign(this, { state, loadScore, unlock, createPlayer, onEvent });
    this.score = this.player = this.loading = null;
    this.disposed = false;
    this.operation = 0;
    this.abort = new AbortController();
  }

  async load() {
    if (this.disposed) return;
    if (this.score) return this.score;
    if (this.loading) return this.loading;
    this.state.musicLoadState = 'loading';
    this.state.musicError = null;
    this.loading = (async () => {
      try {
        const score = await this.loadScore({ signal: this.abort.signal });
        if (this.disposed) return;
        this.score = score;
        Object.assign(this.state, { midiLoaded: true, musicLoadState: 'ready',
          musicInfo: { title: config.midiTitle, bars: score.bars,
            tracks: score.tracks.length, notes: score.notes.length, ppq: score.ppq } });
        return score;
      } catch (error) {
        if (!this.disposed) {
          this.state.musicLoadState = 'error';
          this.state.musicError = `乐谱加载失败：${error.message}`;
        }
        throw error;
      } finally { this.loading = null; }
    })();
    return this.loading;
  }

  async play() {
    if (this.disposed || this.state.audioBusy || this.state.playbackState === 'playing') return;
    const operation = ++this.operation;
    this.state.audioBusy = true;
    this.state.musicError = null;
    try {
      // Resume the audio context directly from the button's user gesture, before fetching.
      await this.unlock();
      if (this.disposed || operation !== this.operation) return;
      this.state.audioReady = true;
      const score = await this.load();
      if (this.disposed || operation !== this.operation) return;
      if (!this.player) this.player = this.createPlayer(score);
      this.syncTempo();
      this.player.setVolume(this.state.volumeDb);
      this.player.play();
      this.tick();
      this.onEvent('PLAY', { bpm: this.state.musicBpm, tick: this.player.snapshot().tick });
    } catch (error) {
      if (this.disposed || operation !== this.operation) return;
      if (!this.disposed && operation === this.operation) {
        this.player?.stop();
        this.state.playbackState = 'stopped';
        this.state.musicError = `音乐无法播放：${error.message}`;
      }
      throw error;
    } finally { if (operation === this.operation) this.state.audioBusy = false; }
  }

  pause() { this.player?.pause(); this.tick(); this.onEvent('PAUSE', { tick: this.player?.snapshot().tick ?? 0 }); }

  stop() {
    ++this.operation;
    this.state.audioBusy = false;
    this.player?.stop();
    Object.assign(this.state, { playbackState: 'stopped', musicProgress: 0, musicBar: 1, musicBeat: 1 });
    this.onEvent('STOP', { tick: 0 });
  }

  setSource(source) {
    if (!['manual', 'conducting'].includes(source)) throw new Error('音乐速度来源无效。');
    this.state.tempoSource = source;
    this.onEvent('SOURCE', { source });
    this.syncTempo();
  }

  setManualBpm(bpm) {
    if (!Number.isFinite(bpm)) throw new Error('手动速度必须是有效数值。');
    this.state.manualBpm = Math.min(config.maxBpm, Math.max(config.minBpm, bpm));
    this.syncTempo();
  }

  setVolume(db) {
    if (!Number.isFinite(db)) throw new Error('音量必须是有效数值。');
    this.state.volumeDb = Math.min(config.maxVolumeDb, Math.max(config.minVolumeDb, db));
    this.player?.setVolume(this.state.volumeDb);
    this.onEvent('VOLUME', { db: this.state.volumeDb });
  }

  syncTempo() {
    const state = this.state;
    let target = state.musicBpm;
    if (state.tempoSource === 'manual') {
      state.tempoFollowStatus = 'manual';
      target = state.manualBpm;
    } else {
      const enabled = state.serialPhase === 'connected' && state.calibrationState === 'ready' && state.detectionActive;
      const measured = enabled && Number.isFinite(state.measuredBpm);
      const fresh = measured && !(state.tempoStatus === 'warming' && state.tempoIntervals < 2);
      state.tempoFollowStatus = !enabled ? 'waiting' : state.tempoStatus === 'idle' || state.tempoStatus === 'out-of-range' ? 'holding' : fresh ? 'tracking' : 'measuring';
      if (fresh && state.tempoStatus !== 'idle' && state.tempoStatus !== 'out-of-range') target = state.measuredBpm;
    }
    if (Math.abs(target - state.musicBpm) >= .05 || (this.player && this.appliedBpm === undefined)) {
      state.musicBpm = target;
      state.bpm = target;
      this.player?.setTempo(target);
      if (this.player) this.appliedBpm = target;
      this.onEvent('TEMPO', { source: state.tempoSource, bpm: target });
    }
  }

  tick() {
    if (this.disposed) return;
    this.syncTempo();
    if (this.player) {
      const snapshot = this.player.snapshot();
      Object.assign(this.state, { playbackState: snapshot.playbackState,
        musicProgress: snapshot.progress, musicBar: snapshot.bar, musicBeat: snapshot.beat });
    }
  }

  dispose() {
    if (this.disposed) return;
    this.stop();
    this.disposed = true;
    this.abort.abort();
    this.player?.dispose();
  }
}
