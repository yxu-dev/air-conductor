import { config } from './config.js';
import { SerialConnection } from './serial.js';
import { TempoEstimator } from './tempo.js';
import { createState } from './state.js';

const errorText = {
  CALIBRATION_NOT_STILL: 'Movement detected during calibration. Rest your right hand and try again.',
  IMU_INIT_FAILED: 'The sensor could not initialize. Check its wiring and reconnect.',
  IMU_READ_FAILED: 'The sensor could not be read. Check its wiring and reconnect.',
  SENSOR_UNAVAILABLE: 'The sensor is unavailable. Check its wiring and reconnect.',
  NOT_CALIBRATED: 'Complete stationary calibration first.',
  CALIBRATION_BUSY: 'Calibration is in progress. Please wait.',
};

export class ConductorSession {
  constructor({ state = createState(), serial, clock = () => performance.now(),
    onChange = () => {}, onBeat = () => {}, startupMs = config.serialStartupMs,
    preparationMs = config.calibrationPreparationMs } = {}) {
    Object.assign(this, { state, clock, onChange, onBeat, startupMs, preparationMs });
    this.tempo = new TempoEstimator();
    this.pending = null;
    this.epoch = 0;
    this.timers = new Set();
    this.awaitingProbe = false;
    this.rows = [];
    this.startedAt = clock();
    this.transport = new SerialConnection({ serial, clock,
      onState: (phase) => this.connectionState(phase),
      onMessage: (message, now, line) => this.message(message, now, line),
      onInvalid: (count) => { state.invalidFrames += count; this.onChange(); },
      onError: (message) => this.showError(message) });
  }

  defer(callback, ms) {
    const timer = setTimeout(() => { this.timers.delete(timer); callback(); }, ms);
    this.timers.add(timer);
    return timer;
  }

  clearTimers() { for (const timer of this.timers) clearTimeout(timer); this.timers.clear(); }

  log(text) {
    this.state.eventLog.push({ at: new Date().toLocaleTimeString(), text });
    if (this.state.eventLog.length > 30) this.state.eventLog.shift();
  }

  showError(message) { this.state.error = message; this.log(message); this.onChange(); }

  recordMusicEvent(kind, data) {
    this.recordHostEvent('MUSIC', kind, data);
  }

  recordVisionEvent(kind, data) { this.recordHostEvent('VISION', kind, data); }

  recordHostEvent(source, kind, data) {
    const payload = `${source},${kind},${JSON.stringify(data)}`;
    this.log(payload);
    this.rows.push({ received_utc: new Date().toISOString(),
      host_elapsed_s: ((this.clock() - this.startedAt) / 1000).toFixed(6),
      type: `HOST_${source}`, timestamp_ms: '', intensity: '', payload });
    if (this.rows.length > 10000) this.rows.shift();
  }

  resetTempo() {
    this.tempo.reset();
    Object.assign(this.state, { measuredBpm: null, tempoStatus: 'waiting', tempoIntervals: 0,
      lastBeatReceivedAt: null, lastBeatIntensity: 0 });
  }

  failPending(error) {
    const pending = this.pending;
    if (!pending) return;
    clearTimeout(pending.timeout);
    this.timers.delete(pending.timeout);
    this.pending = null;
    this.state.actionPending = false;
    pending.reject(error);
  }

  completePending() {
    const pending = this.pending;
    if (!pending) return;
    clearTimeout(pending.timeout);
    this.timers.delete(pending.timeout);
    this.pending = null;
    this.state.actionPending = false;
    pending.resolve();
  }

  waitFor(kind, enabled, timeoutMs) {
    if (this.pending) throw new Error('Wait for the current operation to finish.');
    const epoch = this.epoch;
    const promise = new Promise((resolve, reject) => {
      const timeout = this.defer(() => {
        if (epoch !== this.epoch) return;
        if (kind === 'CALIBRATION') this.state.calibrationState = 'uncalibrated';
        this.state.calibrationCountdown = null;
        this.failPending(new Error('The device did not respond in time. Reconnect and calibrate.'));
        this.showError('The device did not respond in time. Reconnect and calibrate.');
      }, timeoutMs);
      this.pending = { kind, enabled, resolve, reject, timeout, sent: false };
    });
    this.state.actionPending = true;
    return promise;
  }

  beginHandshake() {
    this.failPending(new Error('The device restarted. The current operation was cancelled.'));
    this.clearTimers();
    const epoch = ++this.epoch;
    this.awaitingProbe = false;
    this.resetTempo();
    Object.assign(this.state, { serialPhase: 'initializing', calibrationState: 'awaiting-status',
      calibrationCountdown: null, detectionActive: false, rawStreamActive: false });
    this.defer(async () => {
      if (epoch !== this.epoch) return;
      try {
        await this.transport.send('DETECT,OFF');
        await this.transport.send('STREAM,OFF');
        if (epoch !== this.epoch) return;
        this.awaitingProbe = true;
        await this.transport.send('STATUS');
      } catch (error) { this.showError(error.message); await this.transport.disconnect({ notifyDevice: false }); }
    }, this.startupMs);
    this.defer(() => {
      if (epoch === this.epoch && this.state.serialPhase === 'initializing') {
        this.state.serialPhase = 'unresponsive';
        this.showError('The device is not responding. Disconnect and reconnect.');
      }
    }, this.startupMs + 4000);
  }

  connectionState(phase) {
    this.log(`Device: ${phase}`);
    this.state.serialConnected = phase === 'connected';
    if (phase === 'connected') {
      this.state.error = null;
      this.state.notice = 'The device is starting. Please wait.';
      this.beginHandshake();
    } else {
      this.state.serialPhase = phase;
      if (phase === 'disconnected' || phase === 'disconnecting') {
        this.failPending(new Error('The device disconnected. The current operation was cancelled.'));
        this.clearTimers();
        ++this.epoch;
        this.awaitingProbe = false;
        this.resetTempo();
        Object.assign(this.state, { calibrationState: 'not-started', calibrationCountdown: null,
          detectionActive: false, rawStreamActive: false, deviceModel: null });
        this.state.notice = 'Reconnect the device, then rest your right hand and recalibrate.';
      }
      if (phase === 'connecting') {
        this.state.error = null;
        this.state.receivedBeatCount = this.state.ignoredBeatCount = this.state.rawSamples = this.state.invalidFrames = 0;
      }
    }
    this.onChange();
  }

  message(message, now, line) {
    const state = this.state;
    if (message.type !== 'IMU') {
      this.log(line);
      this.rows.push({ received_utc: new Date().toISOString(), host_elapsed_s: ((now - this.startedAt) / 1000).toFixed(6),
        type: message.type, timestamp_ms: message.timestampMs ?? '', intensity: message.intensity ?? '', payload: line });
      if (this.rows.length > 10000) this.rows.shift();
    }
    switch (message.type) {
      case 'BOOT':
        state.deviceModel = null;
        state.receivedBeatCount = state.ignoredBeatCount = 0;
        state.notice = 'The device is ready for stationary calibration.';
        this.beginHandshake();
        break;
      case 'INFO': state.deviceModel = message.model; break;
      case 'STATUS':
        if (this.awaitingProbe) {
          this.awaitingProbe = false;
          state.serialPhase = 'connected';
          state.notice = 'Device connected. Rest your right hand and calibrate.';
        }
        if (state.calibrationState !== 'preparing') this.applyCalibrationStatus(message.value);
        break;
      case 'READY':
        if (state.calibrationState !== 'preparing') this.applyCalibrationStatus('READY');
        break;
      case 'CALIBRATION': state.calibration = message; break;
      case 'DETECT':
        state.detectionActive = message.enabled;
        this.resetTempo();
        if (this.pending?.kind === 'DETECT' && this.pending.enabled === message.enabled) this.completePending();
        if (message.enabled) state.notice = 'Detection is active. Stroke downward for each beat, then raise your hand to reset.';
        break;
      case 'STREAM':
        state.rawStreamActive = message.enabled;
        if (this.pending?.kind === 'STREAM' && this.pending.enabled === message.enabled) this.completePending();
        break;
      case 'IMU': state.lastImu = message.values; state.rawSamples += 1; break;
      case 'BEAT':
        if (state.serialPhase === 'connected' && state.detectionActive && state.calibrationState === 'ready') {
          state.receivedBeatCount += 1;
          state.lastBeatReceivedAt = now;
          state.lastBeatIntensity = message.intensity;
          const result = this.tempo.add(message.timestampMs, now);
          if (!result.accepted) state.ignoredBeatCount += 1;
          state.measuredBpm = result.bpm;
          state.tempoStatus = result.status;
          state.tempoIntervals = result.intervals.length;
          this.onBeat(message);
        }
        break;
      case 'ERROR': {
        const text = errorText[message.code] ?? `Device error: ${message.code}`;
        if (message.code === 'CALIBRATION_NOT_STILL' || message.code === 'NOT_CALIBRATED') this.applyCalibrationStatus('UNCALIBRATED');
        if (['IMU_INIT_FAILED', 'IMU_READ_FAILED', 'SENSOR_UNAVAILABLE'].includes(message.code)) this.applyCalibrationStatus('SENSOR_ERROR');
        state.calibrationCountdown = null;
        this.failPending(new Error(text));
        this.showError(text);
        break;
      }
    }
    this.onChange();
  }

  applyCalibrationStatus(value) {
    const map = { READY: 'ready', UNCALIBRATED: 'uncalibrated', CALIBRATING: 'calibrating', SENSOR_ERROR: 'sensor-error' };
    this.state.calibrationState = map[value];
    if (value !== 'READY') { this.state.detectionActive = false; this.resetTempo(); }
    if (value === 'SENSOR_ERROR') this.state.rawStreamActive = false;
    if (value === 'READY') {
      this.state.calibrationCountdown = null;
      this.state.notice = 'Calibration complete. Ready to conduct.';
      if (this.pending?.kind === 'CALIBRATION' && this.pending.sent) this.completePending();
    }
  }

  requireReadyConnection() {
    if (this.state.serialPhase !== 'connected') throw new Error('Connect the device and wait for it to finish starting.');
    if (this.state.actionPending) throw new Error('Wait for the current operation to finish.');
  }

  async connect() { return this.transport.connect(); }
  async disconnect() { return this.transport.disconnect(); }

  async calibrate() {
    this.requireReadyConnection();
    const epoch = this.epoch;
    const completion = this.waitFor('CALIBRATION', null, this.preparationMs + 6500);
    // Mark handled immediately while stop commands/preparation are in progress.
    completion.catch(() => {});
    this.resetTempo();
    this.state.error = null;
    this.state.receivedBeatCount = this.state.ignoredBeatCount = 0;
    this.state.calibrationState = 'preparing';
    this.preparationEnds = this.clock() + this.preparationMs;
    this.state.calibrationCountdown = Math.ceil(this.preparationMs / 1000);
    this.state.notice = 'Rest your right hand and stay still until calibration completes.';
    this.onChange();
    try {
      await this.transport.send('DETECT,OFF');
      if (epoch !== this.epoch) return completion;
      this.defer(async () => {
        if (epoch !== this.epoch || this.pending?.kind !== 'CALIBRATION') return;
        this.pending.sent = true;
        this.state.calibrationState = 'calibrating';
        this.state.calibrationCountdown = null;
        this.onChange();
        try { await this.transport.send('CALIBRATE'); }
        catch (error) { this.failPending(error); this.showError(error.message); }
      }, Math.max(0, this.preparationEnds - this.clock()));
    } catch (error) { this.failPending(error); }
    return completion;
  }

  async setDetection(enabled) {
    this.requireReadyConnection();
    if (enabled && this.state.calibrationState !== 'ready') throw new Error('Complete stationary calibration first.');
    const completion = this.waitFor('DETECT', enabled, 3000);
    completion.catch(() => {});
    this.state.error = null;
    if (enabled) this.state.receivedBeatCount = this.state.ignoredBeatCount = 0;
    this.onChange();
    try { await this.transport.send(`DETECT,${enabled ? 'ON' : 'OFF'}`); }
    catch (error) { this.failPending(error); }
    return completion;
  }

  async setRawStream(enabled) {
    this.requireReadyConnection();
    const completion = this.waitFor('STREAM', enabled, 3000);
    completion.catch(() => {});
    this.onChange();
    try { await this.transport.send(`STREAM,${enabled ? 'ON' : 'OFF'}`); }
    catch (error) { this.failPending(error); }
    return completion;
  }

  tick() {
    const now = this.clock();
    if (this.state.calibrationState === 'preparing') this.state.calibrationCountdown = Math.max(0, Math.ceil((this.preparationEnds - now) / 1000));
    if (this.state.detectionActive) {
      const snapshot = this.tempo.snapshot(now);
      this.state.tempoStatus = snapshot.status;
    }
  }

  exportCsv() {
    const fields = ['received_utc', 'host_elapsed_s', 'type', 'timestamp_ms', 'intensity', 'payload'];
    const quote = (value) => `"${String(value).replaceAll('"', '""')}"`;
    return `${fields.join(',')}\r\n${this.rows.map((row) => fields.map((field) => quote(row[field])).join(',')).join('\r\n')}\r\n`;
  }
}
