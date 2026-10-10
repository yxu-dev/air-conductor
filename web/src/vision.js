import { config } from './config.js';

export class VisionSession {
  constructor({ state, control, video, overlay, media = globalThis.navigator?.mediaDevices,
    makeWorker = () => new Worker(config.visionWorkerUrl),
    makeBitmap = source => createImageBitmap(source), clock = () => performance.now(),
    requestFrame = callback => requestAnimationFrame(callback), cancelFrame = id => cancelAnimationFrame(id),
    onEvent = () => {}, baseUrl = globalThis.location?.href ?? 'http://localhost/' }) {
    Object.assign(this, { state, control, video, overlay, media, makeWorker, makeBitmap,
      clock, requestFrame, cancelFrame, onEvent, baseUrl });
    this.epoch = 0;
    this.disposed = false;
    this.stream = this.worker = this.frameId = this.starting = null;
    this.pendingFrame = false;
    this.lastSend = -Infinity;
    this.lastVideoTime = -1;
  }

  async start() {
    if (this.disposed || ['starting', 'running'].includes(this.state.cameraPhase)) return;
    if (!this.media?.getUserMedia) throw new Error('当前浏览器无法开启摄像头，请使用本机 Chrome 或 Edge。');
    const epoch = ++this.epoch;
    Object.assign(this.state, { cameraPhase: 'starting', cameraReady: false, cameraError: null,
      cameraFrames: 0, cameraInferenceMs: null });
    this.control.reset();
    try {
      // Request permission directly from the camera button; never auto-start.
      const stream = await this.media.getUserMedia({ video: { width: { ideal: 640 }, height: { ideal: 480 }, frameRate: { ideal: 30 } }, audio: false });
      if (epoch !== this.epoch) { stream.getTracks().forEach(track => track.stop()); return; }
      this.stream = stream;
      for (const track of stream.getTracks()) track.addEventListener('ended', () => {
        if (epoch === this.epoch) this.fail(new Error('摄像头已断开，可以重新开启。'));
      });
      this.video.srcObject = stream;
      await this.video.play();
      if (epoch !== this.epoch) return;
      this.worker = this.makeWorker();
      const ready = new Promise((resolve, reject) => {
        const timeout = setTimeout(() => reject(new Error('本地手势模型加载超时，请重试。')), 20000);
        this.starting = { reject, timeout };
        this.worker.onmessage = ({ data }) => {
          if (epoch !== this.epoch) return;
          if (data.type === 'READY') { clearTimeout(timeout); this.starting = null; resolve(); }
          else if (data.type === 'ERROR') {
            const error = new Error(`手势识别失败：${data.message}`);
            if (this.starting) { clearTimeout(timeout); this.starting = null; reject(error); }
            else this.fail(error);
          } else if (data.type === 'RESULT') {
            this.pendingFrame = false;
            const now = this.clock();
            this.state.cameraInferenceMs = data.inferenceMs;
            ++this.state.cameraFrames;
            // Long-running inference is stale evidence for a held gesture.
            this.control.process(now - this.lastSend <= config.visionMaxGapMs ? data.result : null, now);
            this.draw(data.result);
          }
        };
        this.worker.onerror = event => {
          const error = new Error(event.message || '摄像头识别线程异常。');
          if (this.starting) { clearTimeout(timeout); this.starting = null; reject(error); }
          else this.fail(error);
        };
      });
      ready.catch(() => {});
      this.worker.postMessage({ type: 'INIT', wasmUrl: new URL(config.visionWasmUrl, this.baseUrl).href,
        modelUrl: new URL(config.gestureModelUrl, this.baseUrl).href });
      await ready;
      if (epoch !== this.epoch) return;
      Object.assign(this.state, { cameraReady: true, cameraPhase: 'running', handStatus: 'unbound' });
      this.onEvent('CAMERA_ON', {});
      this.schedule(epoch);
    } catch (error) { if (epoch === this.epoch) { this.fail(error); throw error; } }
  }

  schedule(epoch) {
    this.frameId = this.requestFrame(() => {
      if (epoch !== this.epoch || !this.state.cameraReady) return;
      this.schedule(epoch);
      this.control.tick(this.clock());
      const now = this.clock();
      if (this.pendingFrame || this.video.readyState < 2 || this.video.currentTime === this.lastVideoTime ||
          now - this.lastSend < 1000 / config.visionFps) return;
      this.pendingFrame = true;
      this.lastSend = now;
      this.lastVideoTime = this.video.currentTime;
      const worker = this.worker;
      void Promise.resolve().then(() => this.makeBitmap(this.video)).then(bitmap => {
        if (epoch !== this.epoch) { bitmap.close(); return; }
        try { worker.postMessage({ type: 'FRAME', bitmap, timestamp: now }, [bitmap]); }
        catch (error) { bitmap.close(); throw error; }
      }).catch(error => { if (epoch === this.epoch) this.fail(error); });
    });
  }

  draw(result) {
    if (!this.overlay) return;
    const width = this.video.videoWidth || 640, height = this.video.videoHeight || 480;
    this.overlay.width = width; this.overlay.height = height;
    this.video.parentElement.style.aspectRatio = `${width} / ${height}`;
    const ctx = this.overlay.getContext('2d');
    const hands = result?.landmarks ?? [];
    hands.forEach((points, i) => {
      const selected = this.state.handTracked && result.handedness?.[i]?.[0]?.categoryName === this.state.leftHandLabel;
      ctx.fillStyle = selected ? '#8be2c2' : '#b5b9c066';
      for (const p of points) { ctx.beginPath(); ctx.arc(p.x * width, p.y * height, selected ? 4 : 2, 0, Math.PI * 2); ctx.fill(); }
    });
  }

  fail(error) {
    this.stop();
    Object.assign(this.state, { cameraPhase: 'error', cameraError: cameraErrorText(error) });
    this.onEvent('CAMERA_ERROR', { message: this.state.cameraError });
  }

  stop() {
    ++this.epoch;
    if (this.frameId !== null) this.cancelFrame(this.frameId);
    this.frameId = null;
    if (this.starting) { clearTimeout(this.starting.timeout); this.starting.reject(new Error('摄像头启动已取消。')); this.starting = null; }
    this.worker?.terminate(); this.worker = null;
    this.stream?.getTracks().forEach(track => track.stop()); this.stream = null;
    this.video.pause(); this.video.srcObject = null;
    this.overlay?.getContext('2d')?.clearRect(0, 0, this.overlay.width, this.overlay.height);
    this.pendingFrame = false; this.lastSend = -Infinity; this.lastVideoTime = -1;
    Object.assign(this.state, { cameraReady: false, cameraPhase: 'off', cameraInferenceMs: null });
    this.control.reset();
    this.onEvent('CAMERA_OFF', {});
  }

  dispose() { this.stop(); this.disposed = true; }
}

function cameraErrorText(error) {
  if (error.name === 'NotAllowedError') return '摄像头权限未开启，请允许此页面使用摄像头后重试。';
  if (error.name === 'NotFoundError') return '未找到摄像头，请检查连接后重试。';
  if (error.name === 'NotReadableError') return '摄像头可能被其他程序占用，请关闭占用程序后重试。';
  return error.message || '摄像头发生异常，可以重新开启。';
}
