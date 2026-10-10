import { config } from './config.js';

export function median(values) {
  const sorted = [...values].sort((a, b) => a - b);
  const half = Math.floor(sorted.length / 2);
  return sorted.length % 2 ? sorted[half] : (sorted[half - 1] + sorted[half]) / 2;
}

export class TempoEstimator {
  constructor(options = {}) {
    this.options = { minBpm: config.minBpm, maxBpm: config.maxBpm,
      window: config.tempoWindow, alpha: config.tempoSmoothing,
      changeIntervals: config.tempoChangeIntervals, tolerance: config.tempoTolerance,
      idleMs: config.beatIdleMs, ...options };
    this.reset();
  }

  reset({ holdBpm = false } = {}) {
    this.bpm = holdBpm ? this.bpm : null;
    this.intervals = [];
    this.evidence = [];
    this.pending = [];
    this.anchor = null;
    this.lastReceipt = null;
    this.status = 'waiting';
  }

  snapshot(now) {
    const idle = this.lastReceipt !== null && now - this.lastReceipt > this.options.idleMs;
    return { bpm: this.bpm, status: idle ? 'idle' : this.status,
      intervals: [...this.intervals], pendingIntervals: this.pending.length };
  }

  add(timestamp, receiptMs) {
    if (!Number.isInteger(timestamp) || timestamp < 0 || timestamp >= 2 ** 32 ||
        !Number.isFinite(receiptMs) || receiptMs < 0) {
      return { accepted: false, reason: 'invalid', ...this.snapshot(receiptMs) };
    }
    if (this.lastReceipt !== null && receiptMs - this.lastReceipt > this.options.idleMs) {
      this.reset({ holdBpm: true });
    }
    if (this.anchor === null) {
      this.anchor = timestamp;
      this.lastReceipt = receiptMs;
      this.status = 'warming';
      return { accepted: true, reason: 'anchor', ...this.snapshot(receiptMs) };
    }
    const dt = (timestamp - this.anchor + 2 ** 32) % 2 ** 32;
    if (dt >= 2 ** 31) {
      this.reset();
      return { ...this.add(timestamp, receiptMs), reason: 'clock-reset' };
    }
    if (dt < 60000 / this.options.maxBpm) {
      // A false early beat must not move the interval's timing anchor.
      return { accepted: false, reason: 'short', ...this.snapshot(receiptMs) };
    }
    this.anchor = timestamp;
    this.lastReceipt = receiptMs;
    if (dt > this.options.idleMs) {
      this.intervals = [];
      this.evidence = [];
      this.pending = [];
      this.status = 'warming';
      return { accepted: true, reason: 'gap', ...this.snapshot(receiptMs) };
    }
    if (dt > 60000 / this.options.minBpm) {
      this.pending = [];
      this.status = 'out-of-range';
      return { accepted: false, reason: 'long-interval', ...this.snapshot(receiptMs) };
    }
    const baseline = this.intervals.length >= 2 ? median(this.intervals) : null;
    // Keep recent plausible intervals even while a change is being verified.
    // Natural variation between candidate intervals must not erase evidence.
    this.evidence.push(dt);
    this.evidence = this.evidence.slice(-this.options.window);
    if (baseline !== null && Math.abs(dt / baseline - 1) > this.options.tolerance) {
      const direction = Math.sign(dt - baseline);
      this.pending = this.evidence.filter(interval =>
        Math.sign(interval - baseline) === direction &&
        Math.abs(interval / baseline - 1) > this.options.tolerance);
      if (this.pending.length < this.options.changeIntervals) {
        this.status = 'verifying';
        return { accepted: false, reason: 'tempo-candidate', ...this.snapshot(receiptMs) };
      }
      this.intervals = [...this.evidence];
      this.pending = [];
    } else {
      this.pending = [];
      this.intervals.push(dt);
      this.intervals = this.intervals.slice(-this.options.window);
    }
    if (this.intervals.length >= 2) {
      const estimate = Math.min(this.options.maxBpm,
        Math.max(this.options.minBpm, 60000 / median(this.intervals)));
      this.bpm = this.bpm === null ? estimate : this.bpm + this.options.alpha * (estimate - this.bpm);
    }
    this.status = this.intervals.length >= 3 ? 'tracking' : 'warming';
    return { accepted: true, reason: 'interval', ...this.snapshot(receiptMs) };
  }
}
