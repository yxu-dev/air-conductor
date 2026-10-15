// Presentation data only. Every point comes from a fresh, confirmed left-hand frame.
export class MotionTrail {
  constructor({ lifetime = 1000, gap = 250, limit = 36 } = {}) {
    Object.assign(this, { lifetime, gap, limit });
    this.reset();
  }
  reset() { this.points = []; this.frame = null; this.last = null; this.segment = 0; this.label = null; }
  sample(state, now) {
    this.points = this.points.filter(p => now - p.at < this.lifetime);
    if (!state.cameraReady || !state.leftHandBound || !state.handTracked || state.experienceMode === 'manual') {
      if (this.last !== null) ++this.segment;
      this.last = null;
      this.frame = state.cameraFrames;
      return this.points;
    }
    if (this.frame === state.cameraFrames) return this.points;
    if (this.label !== state.leftHandLabel) { this.last = null; ++this.segment; this.label = state.leftHandLabel; }
    this.frame = state.cameraFrames;
    const { palmX: x, palmY: y } = state;
    if (![x, y, now].every(Number.isFinite) || x < 0 || x > 1 || y < 0 || y > 1) {
      this.last = null; ++this.segment;
      return this.points;
    }
    if (this.last !== null && (now - this.last > this.gap || now <= this.last)) ++this.segment;
    this.points.push({ x: 1 - x, y, at: now, segment: this.segment });
    this.points = this.points.slice(-this.limit);
    this.last = now;
    return this.points;
  }
}

export class BeatPulses {
  constructor({ lifetime = 1200, limit = 6 } = {}) { Object.assign(this, { lifetime, limit }); this.reset(); }
  reset() { this.items = []; this.nextId = 0; }
  add(intensity, now) {
    if (!Number.isFinite(now) || !Number.isFinite(intensity)) return;
    this.items.push({ id: this.nextId++, at: now, intensity: Math.max(0, Math.min(1, intensity)) });
    this.items = this.items.slice(-this.limit);
  }
  sample(now) {
    this.items = this.items.filter(p => now >= p.at && now - p.at < this.lifetime);
    return this.items.map(p => ({ ...p, progress: (now - p.at) / this.lifetime }));
  }
}
