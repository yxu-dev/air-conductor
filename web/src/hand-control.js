import { config, responseSettings } from './config.js';

const palmIds = [0, 5, 9, 13, 17];
const clamp = (x, lo, hi) => Math.min(hi, Math.max(lo, x));

export function validHand(result, index) {
  const points = result?.landmarks?.[index];
  const side = result?.handedness?.[index]?.[0];
  if (!['Left', 'Right'].includes(side?.categoryName) || !Number.isFinite(side.score) ||
      side.score < config.handConfidence || !Array.isArray(points) || points.length !== 21 ||
      !points.every(p => Number.isFinite(p.x) && Number.isFinite(p.y) && p.x >= 0 && p.x <= 1 && p.y >= 0 && p.y <= 1)) return null;
  return { index, label: side.categoryName, confidence: side.score, landmarks: points,
    gesture: result.gestures?.[index]?.[0] ?? null };
}

export function selectHand(result, label) {
  const hands = (result?.landmarks ?? []).map((_, i) => validHand(result, i)).filter(h => h?.label === label);
  return hands.length === 1 ? hands[0] : null;
}

export function volumeForHeight(y) {
  const ratio = clamp((y - config.cameraTop) / (config.cameraBottom - config.cameraTop), 0, 1);
  return config.gestureMaxVolumeDb + ratio * (config.gestureMinVolumeDb - config.gestureMaxVolumeDb);
}

export function gestureRule(name) {
  return name === 'Open_Palm'
    ? { confidence: config.openPalmConfidence, results: config.openPalmStableResults }
    : { confidence: config.gestureConfidence, results: config.gestureStableResults };
}

export class HandControl {
  constructor({ state, music, clock = () => performance.now(), onEvent = () => {}, allowPlayback = () => true }) {
    Object.assign(this, { state, music, clock, onEvent, allowPlayback });
    this.reset();
  }

  reset() {
    this.lastFrame = this.lastLeft = this.lastVolume = null;
    this.binding = null;
    this.latest = null;
    this.smoothed = null;
    this.candidate = null;
    this.lastGestureReading = null;
    Object.assign(this.state, { leftHandBound: false, leftHandLabel: null, handTracked: false,
      handStatus: this.state.cameraReady ? 'unbound' : 'off', handBindingReady: false,
      handBindingProgress: 0, detectedHands: 0, handednessConfidence: 0,
      gesture: 'None', gestureConfidence: 0, rawGesture: 'None', rawGestureConfidence: 0,
      gestureProgress: 0, palmX: null, palmY: null });
  }

  clearGesture() { this.candidate = null; this.state.gestureProgress = 0; }

  setHandStatus(status) {
    if (this.state.handStatus !== status) this.onEvent('HAND_STATUS', { status, detectedHands: this.state.detectedHands });
    this.state.handStatus = status;
  }

  bindLeft() {
    if (!this.state.cameraReady || !this.state.handBindingReady || !this.latest ||
        this.clock() - this.lastFrame > config.visionMaxGapMs) throw new Error('Show only your left hand and wait for stable tracking before confirming.');
    const hand = validHand(this.latest, 0);
    if (!hand || this.latest.landmarks.length !== 1) throw new Error('Keep your right hand out of view while confirming your left hand.');
    this.clearGesture();
    this.smoothed = null;
    this.lastLeft = null;
    Object.assign(this.state, { leftHandBound: true, leftHandLabel: hand.label, handStatus: 'searching',
      handTracked: false, palmX: null, palmY: null, gesture: 'None', gestureConfidence: 0 });
    this.onEvent('BIND_LEFT', { reportedLabel: hand.label });
  }

  setVolumeSource(source) {
    if (!['manual', 'left-hand'].includes(source)) throw new Error('Invalid volume source.');
    this.state.volumeSource = source;
    this.lastVolume = null;
    if (source === 'manual') this.music.setVolume(this.state.manualVolumeDb);
    this.onEvent('VOLUME_SOURCE', { source });
  }

  setManualVolume(db) {
    if (!Number.isFinite(db)) throw new Error('Volume must be a finite number.');
    this.state.manualVolumeDb = clamp(db, config.minVolumeDb, config.maxVolumeDb);
    if (this.state.volumeSource === 'manual') this.music.setVolume(this.state.manualVolumeDb);
  }

  setGestureControls(enabled) {
    this.state.gestureControlsEnabled = Boolean(enabled);
    this.clearGesture();
    this.onEvent('GESTURE_CONTROLS', { enabled: this.state.gestureControlsEnabled });
  }

  process(result, now = this.clock()) {
    if (!this.state.cameraReady || !Number.isFinite(now) || this.lastFrame !== null && now <= this.lastFrame) return;
    const gap = this.lastFrame === null ? null : now - this.lastFrame;
    if (gap !== null && (gap > config.visionMaxGapMs || gap < 0)) {
      this.clearGesture(); this.binding = null; this.smoothed = null;
    }
    this.lastFrame = now;
    this.latest = result;
    this.state.detectedHands = result?.landmarks?.length ?? 0;
    const single = this.state.detectedHands === 1 ? validHand(result, 0) : null;
    if (single) {
      if (this.binding?.label !== single.label) this.binding = { label: single.label, since: now };
      this.state.handBindingProgress = clamp((now - this.binding.since) / config.handBindingMs, 0, 1);
      this.state.handBindingReady = this.state.handBindingProgress === 1;
    } else {
      this.binding = null; this.state.handBindingReady = false; this.state.handBindingProgress = 0;
    }
    const hand = this.state.leftHandBound ? selectHand(result, this.state.leftHandLabel) : null;
    if (!hand) { this.missing(now); return; }
    const dt = this.lastLeft === null ? 0 : now - this.lastLeft;
    const y = palmIds.reduce((sum, id) => sum + hand.landmarks[id].y, 0) / palmIds.length;
    const x = palmIds.reduce((sum, id) => sum + hand.landmarks[id].x, 0) / palmIds.length;
    const response = responseSettings(this.state.controlResponse);
    const alpha = dt > 0 ? 1 - Math.exp(-dt / response.palmSmoothingMs) : 1;
    this.smoothed = this.smoothed === null ? y : this.smoothed + alpha * (y - this.smoothed);
    this.lastLeft = now;
    this.setHandStatus('tracking');
    Object.assign(this.state, { handTracked: true,
      handednessConfidence: hand.confidence, palmX: x, palmY: this.smoothed });
    if (this.state.volumeSource === 'left-hand' && this.state.playbackState !== 'paused' &&
        (this.lastVolume === null || now - this.lastVolume >= response.volumeUpdateMs)) {
      const target = volumeForHeight(this.smoothed);
      if (Math.abs(target - this.state.volumeDb) >= .25) this.music.setVolume(target);
      this.lastVolume = now;
    }
    this.processGesture(hand.gesture, now);
  }

  processGesture(gesture, now) {
    const score = Number.isFinite(gesture?.score) && gesture.score >= 0 && gesture.score <= 1 ? gesture.score : 0;
    const rawName = typeof gesture?.categoryName === 'string' ? gesture.categoryName : 'None';
    const rule = gestureRule(rawName);
    const good = score >= rule.confidence && ['Closed_Fist', 'Open_Palm'].includes(rawName);
    const name = good ? gesture.categoryName : 'None';
    this.state.rawGesture = rawName;
    this.state.rawGestureConfidence = score;
    this.state.gesture = name;
    this.state.gestureConfidence = good ? score : 0;
    const previous = this.lastGestureReading;
    if (!previous || previous.rawName !== rawName || previous.accepted !== good ||
        now - previous.at >= 1000 && Math.abs(score - previous.score) >= .05) {
      this.onEvent('GESTURE_READING', { rawName, score, accepted: good,
        threshold: rule.confidence, requiredResults: rule.results });
      this.lastGestureReading = { rawName, score, accepted: good, at: now };
    }
    if (!this.state.gestureControlsEnabled || !this.allowPlayback() || !['Closed_Fist', 'Open_Palm'].includes(name)) {
      this.clearGesture(); return;
    }
    // Count fresh consecutive results; a relaxed palm score needs more evidence.
    if (this.candidate?.name !== name) this.candidate = { name, count: 1, fired: false };
    else ++this.candidate.count;
    this.state.gestureProgress = clamp(this.candidate.count / rule.results, 0, 1);
    if (this.state.gestureProgress < 1 || this.candidate.fired) return;
    this.candidate.fired = true;
    if (name === 'Closed_Fist' && this.state.playbackState === 'playing') {
      this.music.pause(); this.onEvent('PAUSE', { hand: 'Left' });
    } else if (name === 'Open_Palm' && this.state.playbackState === 'paused' && this.state.audioReady && !this.state.audioBusy) {
      this.onEvent('RESUME', { hand: 'Left' });
      void this.music.play().catch(error => { this.state.musicError = error.message; });
    }
  }

  missing(now) {
    this.clearGesture(); this.smoothed = null;
    Object.assign(this.state, { handTracked: false, handednessConfidence: 0,
      gesture: 'None', gestureConfidence: 0, rawGesture: 'None', rawGestureConfidence: 0, palmX: null, palmY: null });
    this.setHandStatus(!this.state.leftHandBound ? 'unbound' :
      this.lastLeft === null ? 'searching' : now - this.lastLeft >= config.handLostMs ? 'lost' : 'brief-loss');
  }

  tick(now = this.clock()) {
    if (!this.state.cameraReady || this.lastFrame !== null && now - this.lastFrame <= config.visionMaxGapMs) return;
    this.state.handBindingReady = false; this.state.handBindingProgress = 0;
    this.binding = null;
    this.missing(now);
  }
}
