// Presentation only: sensor beats and confirmed left-hand frames remain authoritative.
export class MotionTrail {
  constructor({ lifetime = 1000, gap = 250, limit = 36 } = {}) {
    Object.assign(this, { lifetime, gap, limit });
    this.reset();
  }
  reset() { this.points = []; this.frame = null; this.last = null; this.segment = 0; }
  sample(state, now) {
    this.points = this.points.filter(p => now - p.at < this.lifetime);
    if (!state.cameraReady || !state.leftHandBound || !state.handTracked || state.experienceMode === 'manual') {
      if (this.last !== null) ++this.segment;
      this.last = null;
      this.frame = state.cameraFrames;
      return this.points;
    }
    if (this.frame === state.cameraFrames) return this.points;
    this.frame = state.cameraFrames;
    const { palmX: x, palmY: y } = state;
    if (![x, y, now].every(Number.isFinite) || x < 0 || x > 1 || y < 0 || y > 1) return this.points;
    if (this.last !== null && (now - this.last > this.gap || now <= this.last)) ++this.segment;
    this.points.push({ x: 1 - x, y, at: now, segment: this.segment }); // Mirror the preview.
    this.points = this.points.slice(-this.limit);
    this.last = now;
    return this.points;
  }
}

export class MotionStage {
  constructor(canvas, state) {
    Object.assign(this, { canvas, state });
    this.ctx = canvas.getContext('2d');
    this.trail = new MotionTrail();
    this.pulses = [];
    this.motionQuery = matchMedia('(prefers-reduced-motion: reduce)');
    this.resizeObserver = new ResizeObserver(() => this.resize());
    this.resizeObserver.observe(canvas);
    this.resize(); this.start();
  }
  resize() {
    const box = this.canvas.getBoundingClientRect();
    this.width = box.width; this.height = box.height;
    const ratio = Math.min(window.devicePixelRatio || 1, 2);
    this.canvas.width = Math.round(box.width * ratio);
    this.canvas.height = Math.round(box.height * ratio);
    this.ctx.setTransform(ratio, 0, 0, ratio, 0, 0);
  }
  pulse(intensity) {
    if (!this.motionQuery.matches) this.pulses.push({ at: performance.now(), intensity });
    this.pulses = this.pulses.slice(-8);
  }
  start() {
    if (this.frame) return;
    this.lastDraw = -Infinity;
    const frame = now => {
      if (now - this.lastDraw >= 32) { this.draw(now); this.lastDraw = now; }
      this.frame = requestAnimationFrame(frame);
    };
    this.frame = requestAnimationFrame(frame);
  }
  stop() { cancelAnimationFrame(this.frame); this.frame = null; this.trail.reset(); this.pulses = []; }
  dispose() { this.stop(); this.resizeObserver.disconnect(); }
  draw(now) {
    const { ctx: c, width: w, height: h, state } = this;
    if (!w || !h) return;
    c.clearRect(0, 0, w, h);
    const cx = w / 2, cy = h * .46, size = Math.min(w * .37, h * .36);
    const moving = state.playbackState === 'playing' && !this.motionQuery.matches;
    const phase = moving ? state.musicProgress * Math.PI * 8 : 0;
    const glow = c.createRadialGradient(cx, cy, 0, cx, cy, size * 1.7);
    glow.addColorStop(0, '#b1d9700f'); glow.addColorStop(1, '#b1d97000');
    c.fillStyle = glow; c.fillRect(0, 0, w, h);
    for (let i = 0; i < 5; i++) {
      c.beginPath(); c.ellipse(cx, cy, size * (1 + i * .13), size * (.83 + i * .08), -.25 + Math.sin(phase + i) * .035, 0, Math.PI * 2);
      c.strokeStyle = `rgba(193,218,160,${.1 - i * .012})`; c.lineWidth = 1; c.stroke();
    }
    // A quiet orbit in Listen mode follows the music, without inventing sensor beats.
    if (state.experienceMode === 'manual' && state.playbackState === 'playing') {
      const x = cx + Math.cos(phase) * size * 1.33, y = cy + Math.sin(phase) * size * 1.07;
      c.beginPath(); c.arc(x, y, 3, 0, Math.PI * 2); c.fillStyle = '#d4ed91'; c.fill();
    }
    this.pulses = this.pulses.filter(p => now - p.at < 850);
    for (const p of this.pulses) {
      const t = (now - p.at) / 850;
      c.beginPath(); c.arc(cx, cy, size * (.65 + t * 1.2), 0, Math.PI * 2);
      c.strokeStyle = `rgba(212,237,145,${(1 - t) * (.2 + p.intensity * .3)})`;
      c.lineWidth = 1 + p.intensity * 2 * (1 - t); c.stroke();
    }
    const points = this.trail.sample(state, now);
    if (!this.motionQuery.matches) {
      for (let i = 1; i < points.length; i++) {
        const a = points[i - 1], b = points[i];
        if (a.segment !== b.segment) continue;
        c.beginPath(); c.moveTo(a.x * w, a.y * h); c.lineTo(b.x * w, b.y * h);
        c.strokeStyle = `rgba(212,237,145,${(1 - (now - b.at) / this.trail.lifetime) * .55})`;
        c.lineWidth = 2; c.lineCap = 'round'; c.stroke();
      }
    }
    if (state.handTracked && state.experienceMode === 'conduct' && Number.isFinite(state.palmX) && Number.isFinite(state.palmY)) {
      const x = (1 - state.palmX) * w, y = state.palmY * h;
      c.beginPath(); c.arc(x, y, 14, 0, Math.PI * 2); c.strokeStyle = '#d4ed9166'; c.lineWidth = 1; c.stroke();
      c.beginPath(); c.arc(x, y, 4, 0, Math.PI * 2); c.fillStyle = '#d4ed91'; c.fill();
    }
    // Corner registration marks provide a stable frame of reference.
    c.strokeStyle = '#d4ed912b'; c.lineWidth = 1;
    for (const [x, y, dx, dy] of [[26, 87, 1, 1], [w - 26, 87, -1, 1], [26, h - 135, 1, -1], [w - 26, h - 135, -1, -1]]) {
      c.beginPath(); c.moveTo(x, y + dy * 10); c.lineTo(x, y); c.lineTo(x + dx * 10, y); c.stroke();
    }
  }
}
