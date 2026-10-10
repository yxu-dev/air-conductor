export function readiness(state, supported = true) {
  if (state.experienceMode === 'manual') return { ready: state.musicLoadState === 'ready', step: 'listen', title: 'Make it your tempo.', hint: 'Press play, then explore tempo and volume with the controls.' };
  if (!supported) return { ready: false, step: 'browser', title: 'Open in Chrome or Edge.', hint: 'Device conducting needs a browser with Web Serial. You can still try Listen mode.' };
  if (state.serialPhase !== 'connected') return { ready: false, step: 'connect', title: 'Connect your right hand.', hint: 'Wear the wrist sensor, connect the Arduino by USB, then select it in the device picker.' };
  if (state.calibrationState !== 'ready') return { ready: false, step: 'calibrate', title: 'Find your still point.', hint: state.calibrationState === 'preparing' ? 'Rest your right hand. Calibration begins after the countdown.' : state.calibrationState === 'calibrating' ? 'Keep your right hand still while the sensor takes its reference.' : 'Rest your right hand and calibrate before conducting.' };
  if (!state.cameraReady) return { ready: false, step: 'camera', title: 'Bring your left hand into view.', hint: 'Enable the camera to control volume and playback with your left hand.' };
  if (!state.leftHandBound) return { ready: false, step: 'left', title: 'Meet your left hand.', hint: 'Show only your left hand. Once tracking is stable, confirm it below.' };
  if (state.musicLoadState !== 'ready') return { ready: false, step: 'score', title: 'Getting the music ready.', hint: state.musicLoadState === 'error' ? 'The score could not load. Retry loading the music.' : 'Loading the local score. Your devices are ready.' };
  return { ready: !state.actionPending, step: 'ready', title: 'The music is in your hands.', hint: 'Start your performance. Right hand gives the beat; left hand shapes the sound.' };
}

export class Experience {
  constructor({ state, session, music, control, vision, onChange = () => {}, onEvent = () => {} }) {
    Object.assign(this, { state, session, music, control, vision, onChange, onEvent });
    this.operation = 0;
  }

  setMode(mode) {
    if (!['conduct', 'manual'].includes(mode) || this.state.performanceActive || this.state.performanceBusy) return;
    this.state.experienceMode = mode;
    this.state.performanceError = null;
    this.music.setSource(mode === 'conduct' ? 'conducting' : 'manual');
    this.control.setVolumeSource(mode === 'conduct' ? 'left-hand' : 'manual');
    this.control.setGestureControls(mode === 'conduct');
    this.onEvent('MODE', { mode });
    this.onChange();
  }

  async start() {
    const state = this.state;
    if (state.performanceBusy || state.playbackState === 'playing') return;
    const ready = readiness(state, this.session.transport.supported);
    if (!ready.ready) throw new Error(ready.hint);
    const operation = ++this.operation;
    state.performanceBusy = true;
    state.performanceError = null;
    this.onChange();
    // Invoke audio unlock before any awaited serial command, within the click.
    const audio = this.music.play();
    audio.catch(() => {});
    try {
      if (state.experienceMode === 'conduct' && !state.detectionActive) await this.session.setDetection(true);
      await audio;
      if (operation !== this.operation) return;
      if (state.experienceMode === 'conduct' && (state.serialPhase !== 'connected' || !state.detectionActive)) throw new Error('The device disconnected. Reconnect and calibrate before starting again.');
      state.performanceActive = true;
      this.onEvent('START', { mode: state.experienceMode });
    } catch (error) {
      if (operation !== this.operation) return;
      this.music.stop();
      state.performanceActive = false;
      if (state.detectionActive && state.serialPhase === 'connected') {
        try { await this.session.setDetection(false); } catch { await this.session.disconnect(); }
      }
      state.performanceError = error.message;
      throw error;
    } finally {
      if (operation === this.operation) state.performanceBusy = false;
      this.onChange();
    }
  }

  async end() {
    const operation = ++this.operation;
    this.music.stop(); // Silence immediately, even if device commands are pending.
    Object.assign(this.state, { performanceActive: false, performanceBusy: true, performanceError: null });
    this.onChange();
    try {
      if (this.state.actionPending) await this.session.disconnect();
      else if (this.state.detectionActive && this.state.serialPhase === 'connected') {
        try { await this.session.setDetection(false); }
        catch { await this.session.disconnect(); }
      }
      this.onEvent('END', {});
    } catch (error) { this.state.performanceError = error.message; }
    finally { if (operation === this.operation) this.state.performanceBusy = false; this.onChange(); }
  }

  async reset() {
    await this.end();
    this.state.performanceBusy = true;
    try {
      this.vision.stop();
      await this.session.disconnect();
      this.state.performanceError = null;
      this.onEvent('RESET', {});
    } finally { this.state.performanceBusy = false; this.onChange(); }
  }

  tick() {
    if (this.state.performanceActive && this.state.experienceMode === 'conduct' &&
        (this.state.serialPhase !== 'connected' || this.state.calibrationState !== 'ready' || !this.state.detectionActive)) {
      if (this.state.playbackState === 'playing') this.music.pause();
      this.state.performanceActive = false;
      this.state.performanceError = 'Conducting paused because the device is unavailable. Reconnect, calibrate, then resume.';
      this.onEvent('INTERRUPTED', {});
    }
  }
}
