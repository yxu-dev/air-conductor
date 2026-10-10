import * as THREE from 'three';
import { MotionTrail, BeatPulses } from './motion-trail.js';
export { MotionTrail } from './motion-trail.js';

const palettes = {
  aurora: { ribbon: '#bfe889', secondary: '#63d8cd', pearl: '#f4e3bb', background: '#11231e' },
  nocturne: { ribbon: '#bab2ff', secondary: '#80ddeb', pearl: '#f6bbdb', background: '#171b32' },
};
const clamp = value => Math.max(0, Math.min(1, value));

function glowTexture() {
  const size = 64, data = new Uint8Array(size * size * 4);
  for (let y = 0; y < size; y++) for (let x = 0; x < size; x++) {
    const d = Math.hypot((x + .5) / size - .5, (y + .5) / size - .5) * 2;
    const i = (y * size + x) * 4;
    data[i] = data[i + 1] = data[i + 2] = 255;
    data[i + 3] = Math.round(Math.max(0, 1 - d) ** 3 * 255);
  }
  const texture = new THREE.DataTexture(data, size, size, THREE.RGBAFormat);
  texture.magFilter = texture.minFilter = THREE.LinearFilter;
  texture.needsUpdate = true;
  return texture;
}

function orbitPoints(radius, warp = 0) {
  return Array.from({ length: 128 }, (_, i) => {
    const t = i / 128 * Math.PI * 2;
    return new THREE.Vector3(Math.cos(t) * radius, Math.sin(t) * radius * .85, Math.sin(t * 3) * warp);
  });
}

export class MotionStage {
  constructor(canvas, state) {
    Object.assign(this, { canvas, state, frame: null, running: false, disposed: false, contextLost: false, visible: true, phase: 0 });
    this.trail = new MotionTrail();
    this.pulses = new BeatPulses();
    this.motionQuery = matchMedia('(prefers-reduced-motion: reduce)');
    this.motionChange = () => { state.systemReducedMotion = this.motionQuery.matches; };
    this.motionChange(); this.motionQuery.addEventListener('change', this.motionChange);
    this.visibilityChange = () => this.schedule();
    this.lost = event => {
      event.preventDefault(); this.contextLost = true;
      this.cancel(); this.pulses.reset(); this.setPhase('lost');
    };
    this.restored = () => {
      if (this.disposed) return;
      this.contextLost = false; this.resize(); this.setPhase('ready'); this.schedule();
    };
    try {
      this.renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: true, powerPreference: 'low-power' });
      this.renderer.setClearColor(0x000000, 0);
      this.renderer.outputColorSpace = THREE.SRGBColorSpace;
      this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
      this.renderer.toneMappingExposure = 1.2;
      this.scene = new THREE.Scene();
      this.camera = new THREE.PerspectiveCamera(42, 1, .1, 40);
      this.camera.position.set(0, 0, 8.5);
      this.buildScene(); this.setTheme(state.sceneTheme); this.setPhase('ready');
      canvas.addEventListener('webglcontextlost', this.lost);
      canvas.addEventListener('webglcontextrestored', this.restored);
      document.addEventListener('visibilitychange', this.visibilityChange);
      this.resizeObserver = new ResizeObserver(() => this.resize());
      this.resizeObserver.observe(canvas);
      this.intersectionObserver = new IntersectionObserver(([entry]) => {
        this.visible = entry.isIntersecting;
        if (!this.visible) this.cancel(); else this.schedule();
      });
      this.intersectionObserver.observe(canvas);
      this.resize(); this.start();
    } catch (error) {
      this.release(); this.setPhase('fallback');
      state.sceneError = 'Enhanced visuals are unavailable. Music and hand controls remain available.';
    }
  }

  setPhase(phase) {
    this.state.scenePhase = phase;
    this.canvas.dataset.renderer = phase === 'ready' ? 'three' : phase;
  }

  get reduced() { return this.state.visualReducedMotion || this.motionQuery.matches; }

  buildScene() {
    const scene = this.scene;
    this.rig = new THREE.Group(); this.rig.position.y = .35; scene.add(this.rig);
    this.ribbons = [];
    for (let i = 0; i < 4; i++) {
      const curve = new THREE.CatmullRomCurve3(orbitPoints(1.55 + i * .22, .11 + i * .03), true);
      const geometry = new THREE.TubeGeometry(curve, 96, i === 0 ? .028 : .013, 4, true);
      const material = new THREE.MeshBasicMaterial({ color: '#bfe889', transparent: true, opacity: .75, depthWrite: false });
      const mesh = new THREE.Mesh(geometry, material);
      mesh.rotation.set(.25 + i * .3, i * .38, i * .35);
      this.ribbons.push(mesh); this.rig.add(mesh);
    }
    this.orbits = [];
    for (let i = 0; i < 7; i++) {
      const line = new THREE.LineLoop(new THREE.BufferGeometry().setFromPoints(orbitPoints(1.9 + i * .14)),
        new THREE.LineBasicMaterial({ color: '#a6d5b2', transparent: true, opacity: .14, blending: THREE.AdditiveBlending, depthWrite: false }));
      line.rotation.set(.55 + i * .12, -.3, i * .17);
      this.orbits.push(line); this.rig.add(line);
    }
    this.core = new THREE.Mesh(new THREE.IcosahedronGeometry(.64, 1),
      new THREE.MeshBasicMaterial({ color: '#e3efc9', transparent: true, opacity: .16, depthWrite: false }));
    this.rig.add(this.core);
    const wire = new THREE.Mesh(new THREE.IcosahedronGeometry(.67, 1),
      new THREE.MeshBasicMaterial({ color: '#dfefd0', wireframe: true, transparent: true, opacity: .09 }));
    this.core.add(wire);
    this.glow = glowTexture();
    this.aura = new THREE.Sprite(new THREE.SpriteMaterial({ map: this.glow, color: '#bfe889', transparent: true,
      opacity: .23, depthWrite: false, blending: THREE.AdditiveBlending }));
    this.aura.scale.set(5.5, 5.5, 1); this.rig.add(this.aura);

    let seed = 27;
    const random = () => { seed = (seed * 1664525 + 1013904223) >>> 0; return seed / 4294967296; };
    const positions = new Float32Array(240 * 3);
    for (let i = 0; i < 240; i++) {
      const t = random() * Math.PI * 2, r = 1.8 + random() * 1.6;
      positions.set([Math.cos(t) * r, Math.sin(t) * r * .8, (random() - .5) * 2.6], i * 3);
    }
    const geometry = new THREE.BufferGeometry(); geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
    this.stars = new THREE.Points(geometry, new THREE.PointsMaterial({ color: '#def7ca', size: .055, map: this.glow,
      transparent: true, opacity: .7, depthWrite: false, blending: THREE.AdditiveBlending }));
    scene.add(this.stars);

    const pulseGeometry = new THREE.TorusGeometry(1, .009, 4, 96);
    this.pulseMeshes = Array.from({ length: this.pulses.limit }, () => {
      const mesh = new THREE.Mesh(pulseGeometry, new THREE.MeshBasicMaterial({ color: '#d4ed91', transparent: true,
        opacity: 0, depthWrite: false, blending: THREE.AdditiveBlending }));
      mesh.position.y = .35; mesh.visible = false; scene.add(mesh); return mesh;
    });
    this.cursor = new THREE.Group(); scene.add(this.cursor);
    const bead = new THREE.Mesh(new THREE.SphereGeometry(.045, 12, 8), new THREE.MeshBasicMaterial({ color: '#e5ffcc' }));
    const halo = new THREE.Sprite(new THREE.SpriteMaterial({ map: this.glow, color: '#c0ef8f', transparent: true,
      opacity: .9, depthWrite: false, blending: THREE.AdditiveBlending }));
    halo.scale.set(.5, .5, 1); this.cursor.add(bead, halo);
    this.cursor.visible = false;
    this.buildTrail();
  }

  buildTrail() {
    const count = this.trail.limit * 2;
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute('position', new THREE.BufferAttribute(new Float32Array(count * 3), 3).setUsage(THREE.DynamicDrawUsage));
    geometry.setAttribute('aSide', new THREE.BufferAttribute(new Float32Array(count), 1).setUsage(THREE.DynamicDrawUsage));
    geometry.setAttribute('aOpacity', new THREE.BufferAttribute(new Float32Array(count), 1).setUsage(THREE.DynamicDrawUsage));
    geometry.setIndex(new THREE.BufferAttribute(new Uint16Array((this.trail.limit - 1) * 6), 1).setUsage(THREE.DynamicDrawUsage));
    geometry.setDrawRange(0, 0);
    const material = new THREE.ShaderMaterial({ transparent: true, depthWrite: false, depthTest: false,
      side: THREE.DoubleSide, blending: THREE.AdditiveBlending, uniforms: { uColor: { value: new THREE.Color('#c7ed98') } },
      vertexShader: `attribute float aSide; attribute float aOpacity; varying float vSide; varying float vOpacity;
        void main() { vSide = aSide; vOpacity = aOpacity; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }`,
      fragmentShader: `uniform vec3 uColor; varying float vSide; varying float vOpacity;
        void main() { float edge = pow(max(0.0, 1.0 - abs(vSide)), 1.5); gl_FragColor = vec4(uColor, edge * vOpacity);
          #include <tonemapping_fragment>
          #include <colorspace_fragment>
        }`,
    });
    this.ribbonTrail = new THREE.Mesh(geometry, material);
    this.ribbonTrail.frustumCulled = false; this.ribbonTrail.renderOrder = 10;
    this.scene.add(this.ribbonTrail);
  }

  setTheme(name) {
    this.theme = name in palettes ? name : 'aurora';
    this.canvas.dataset.sceneTheme = this.theme;
    const palette = palettes[this.theme];
    this.ribbons.forEach((mesh, i) => { mesh.material.color.set(i % 2 ? palette.secondary : palette.ribbon); });
    this.orbits.forEach(line => line.material.color.set(palette.ribbon));
    this.core.material.color.set(palette.pearl);
    this.aura.material.color.set(palette.ribbon); this.stars.material.color.set(palette.pearl);
    this.pulseMeshes.forEach(mesh => mesh.material.color.set(palette.ribbon));
    this.ribbonTrail.material.uniforms.uColor.value.set(palette.ribbon);
    this.cursor.children[0].material.color.set(palette.pearl); this.cursor.children[1].material.color.set(palette.ribbon);
  }

  resize() {
    if (!this.renderer || this.disposed || this.contextLost) return;
    const box = this.canvas.getBoundingClientRect();
    this.width = Math.max(1, box.width); this.height = Math.max(1, box.height);
    // Bound the framebuffer even on large/high-DPI screens. A broken layout
    // must not allocate a page-sized GPU surface or monopolize the renderer.
    const ratio = Math.min(window.devicePixelRatio || 1, 1, Math.sqrt(600000 / (this.width * this.height)));
    this.renderer.setPixelRatio(ratio);
    this.renderer.setSize(this.width, this.height, false);
    this.camera.aspect = this.width / this.height; this.camera.updateProjectionMatrix();
    this.lastDraw = -Infinity;
  }

  worldPoint(x, y) {
    const height = 2 * Math.tan(THREE.MathUtils.degToRad(this.camera.fov / 2)) * (this.camera.position.z - 2.4);
    return new THREE.Vector3((x - .5) * height * this.camera.aspect, (.5 - y) * height, 2.4);
  }

  updateTrail(points, now) {
    const geometry = this.ribbonTrail.geometry;
    if (this.reduced || points.length < 2) { geometry.setDrawRange(0, 0); return; }
    const pos = geometry.attributes.position, side = geometry.attributes.aSide, opacity = geometry.attributes.aOpacity;
    const world = points.map(p => this.worldPoint(p.x, p.y));
    let indices = 0;
    for (let i = 0; i < points.length; i++) {
      const a = world[i > 0 && points[i - 1].segment === points[i].segment ? i - 1 : i];
      const b = world[i + 1 < points.length && points[i + 1].segment === points[i].segment ? i + 1 : i];
      const dx = b.x - a.x, dy = b.y - a.y, length = Math.hypot(dx, dy) || 1;
      const nx = -dy / length * .06, ny = dx / length * .06;
      pos.setXYZ(i * 2, world[i].x + nx, world[i].y + ny, 2.4);
      pos.setXYZ(i * 2 + 1, world[i].x - nx, world[i].y - ny, 2.4);
      side.setX(i * 2, -1); side.setX(i * 2 + 1, 1);
      const fade = clamp(1 - (now - points[i].at) / this.trail.lifetime);
      opacity.setX(i * 2, fade); opacity.setX(i * 2 + 1, fade);
      if (i && points[i].segment === points[i - 1].segment) {
        const j = i * 2;
        geometry.index.array.set([j - 2, j - 1, j, j, j - 1, j + 1], indices); indices += 6;
      }
    }
    pos.needsUpdate = side.needsUpdate = opacity.needsUpdate = geometry.index.needsUpdate = true;
    geometry.setDrawRange(0, indices);
  }

  pulse(intensity) { if (!this.reduced && this.renderer && !this.contextLost) this.pulses.add(intensity, performance.now()); }
  start() { if (this.disposed) return; this.running = true; this.lastDraw = -Infinity; this.lastTime = null; this.schedule(); }
  cancel() { cancelAnimationFrame(this.frame); this.frame = null; }
  stop() { this.running = false; this.cancel(); this.trail.reset(); this.pulses.reset(); }
  schedule() {
    if (!this.running || !this.renderer || this.frame !== null || this.contextLost || this.disposed || !this.visible || document.hidden) return;
    this.frame = requestAnimationFrame(now => {
      this.frame = null;
      if (now - (this.lastDraw ?? -Infinity) >= 32) { this.draw(now); this.lastDraw = now; }
      this.schedule();
    });
  }

  draw(now) {
    if (!this.width || !this.height) return;
    if (this.theme !== this.state.sceneTheme) this.setTheme(this.state.sceneTheme);
    const dt = this.lastTime === null ? 0 : Math.min(.06, (now - this.lastTime) / 1000); this.lastTime = now;
    const moving = !this.reduced, playing = this.state.playbackState === 'playing';
    if (moving) this.phase += dt * (this.state.musicBpm / 100) * (playing ? .32 : this.state.playbackState === 'paused' ? 0 : .05);
    if (!moving) this.pulses.reset();
    const pulses = this.pulses.sample(now);
    const energy = pulses.reduce((max, p) => Math.max(max, p.intensity * (1 - p.progress) ** 2), 0);
    const gain = clamp((this.state.volumeDb + 36) / 36);
    this.rig.rotation.set(.25 + Math.sin(this.phase) * .12, -.3 + this.phase * .2, -.12 + Math.sin(this.phase * .6) * .08);
    this.rig.scale.setScalar(1 + energy * .07);
    this.stars.rotation.z = this.phase * .08;
    this.core.rotation.y = this.phase * .4;
    this.ribbons.forEach((mesh, i) => {
      mesh.rotation.z = i * .35 + this.phase * (i % 2 ? -.16 : .22);
      mesh.material.opacity = clamp((playing ? .6 : .28) + gain * .15 + energy * .25);
    });
    this.aura.material.opacity = (playing ? .27 : .12) + gain * .06 + energy * .25;
    this.core.material.opacity = playing ? .14 : .06;
    this.pulseMeshes.forEach((mesh, i) => {
      const p = pulses[i]; mesh.visible = Boolean(p);
      if (!p) return;
      mesh.scale.setScalar(1.25 + (1 - (1 - p.progress) ** 3) * (1.8 + p.intensity * .7));
      mesh.material.opacity = (1 - p.progress) ** 2 * (.25 + p.intensity * .75);
    });
    const points = this.trail.sample(this.state, now); this.updateTrail(points, now);
    this.cursor.visible = this.state.handTracked && this.state.leftHandBound && this.state.cameraReady && this.state.experienceMode === 'conduct' && Number.isFinite(this.state.palmX) && Number.isFinite(this.state.palmY);
    if (this.cursor.visible) this.cursor.position.copy(this.worldPoint(1 - this.state.palmX, this.state.palmY));
    this.renderer.render(this.scene, this.camera);
  }

  release() {
    const geometries = new Set(), materials = new Set();
    this.scene?.traverse(object => {
      if (object.geometry) geometries.add(object.geometry);
      if (object.material) for (const material of Array.isArray(object.material) ? object.material : [object.material]) materials.add(material);
    });
    geometries.forEach(geometry => geometry.dispose()); materials.forEach(material => material.dispose());
    this.glow?.dispose(); this.renderer?.dispose(); this.renderer?.forceContextLoss(); this.renderer = null;
  }

  dispose() {
    this.disposed = true; this.stop();
    this.resizeObserver?.disconnect(); this.intersectionObserver?.disconnect();
    this.motionQuery.removeEventListener('change', this.motionChange);
    document.removeEventListener('visibilitychange', this.visibilityChange);
    this.canvas.removeEventListener('webglcontextlost', this.lost);
    this.canvas.removeEventListener('webglcontextrestored', this.restored);
    this.release();
  }
}
