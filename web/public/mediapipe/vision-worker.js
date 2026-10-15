/* Classic Worker: MediaPipe 1.0.1 loads its WASM runtime with importScripts. */
let recognizer;
self.onmessage = async ({ data }) => {
  try {
    if (data.type === 'INIT') {
      importScripts('./vision_bundle.js');
      const files = await Vision.FilesetResolver.forVisionTasks(data.wasmUrl);
      recognizer = await Vision.GestureRecognizer.createFromOptions(files, {
        baseOptions: { modelAssetPath: data.modelUrl, delegate: 'CPU' },
        runningMode: 'VIDEO', numHands: 2,
        minHandDetectionConfidence: .6, minHandPresenceConfidence: .6, minTrackingConfidence: .6,
        cannedGesturesClassifierOptions: { categoryAllowlist: ['Open_Palm', 'Closed_Fist'] },
      });
      self.postMessage({ type: 'READY' });
    } else if (data.type === 'FRAME') {
      const started = performance.now();
      const result = recognizer.recognizeForVideo(data.bitmap, data.timestamp);
      self.postMessage({ type: 'RESULT', result, inferenceMs: performance.now() - started });
    }
  } catch (error) {
    self.postMessage({ type: 'ERROR', message: error.message ?? String(error) });
  } finally { data.bitmap?.close(); }
};
