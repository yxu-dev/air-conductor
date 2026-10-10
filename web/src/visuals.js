import { config } from './config.js';

const views = new WeakMap();
const calibrationNames = { 'not-started': '未校准', 'awaiting-status': '等待设备',
  uncalibrated: '等待校准', preparing: '准备静止', calibrating: '正在校准',
  ready: '校准完成', 'sensor-error': '传感器异常' };
const connectionNames = { disconnected: '未连接', connecting: '选择设备',
  initializing: '设备启动中', connected: '已连接', disconnecting: '正在断开', unresponsive: '未收到回应' };
const tempoNames = { waiting: '等待拍点', warming: '测量中 · 再挥几拍',
  tracking: '跟随挥拍', verifying: '确认速度变化', idle: '停挥 · 保留上次节奏',
  'out-of-range': '当前间隔超出 50–180 BPM 范围' };
const playbackNames = { stopped: '已停止', playing: '正在播放', paused: '已暂停' };
const followNames = { manual: '手动控制音乐速度', waiting: '等待设备拍点 · 保持当前音乐速度',
  measuring: '等待稳定拍点 · 保持当前音乐速度', tracking: '音乐速度跟随挥拍',
  holding: '停挥或间隔超出范围 · 保持上次音乐速度' };
const cameraNames = { off: '摄像头未开启', starting: '正在开启摄像头与加载模型', running: '摄像头已开启', error: '摄像头异常' };
const handNames = { off: '等待摄像头', unbound: '等待确认左手', searching: '请将左手放入画面',
  tracking: '左手正在追踪', 'brief-loss': '左手暂时未识别 · 保持音量', lost: '左手丢失 · 保持音量' };
const gestureNames = { None: '未识别控制手势', Open_Palm: '左手张掌', Closed_Fist: '左手握拳' };

export function renderStatus(root, state, { supported = true, now = performance.now() } = {}) {
  let view = views.get(root);
  if (!view) {
    root.innerHTML = `
      <header><div class="wordmark">AIR CONDUCTOR</div><span class="stage-label">实时挥拍节奏</span></header>
      <section class="intro"><h1>用挥拍，给出节奏。</h1><p>右手传感器控制节奏；左手摄像头控制音量、暂停与恢复。右手明显下挥计一拍，抬手回位。</p></section>
      <section class="connection-panel" aria-label="设备控制">
        <div class="steps"><div><span>01 / 设备</span><strong id="connection-status"></strong></div><div><span>02 / 校准</span><strong id="calibration-status"></strong></div><div><span>03 / 检测</span><strong id="detection-status"></strong></div></div>
        <div class="actions"><button id="connect" class="secondary">连接设备</button><button id="calibrate" class="secondary">静止校准</button><button id="detect" class="primary">开始检测</button></div>
        <p id="notice" role="status" aria-live="polite"></p><p id="error" role="alert" hidden></p>
      </section>
      <section class="performance" aria-label="节奏读数">
        <div class="tempo-card"><div class="card-label">当前节奏</div><div class="tempo-number"><span id="bpm">—</span><span class="unit">BPM</span></div><p id="tempo-status"></p><span class="range-label">测量范围 50–180 BPM</span></div>
        <div class="beat-card"><div class="card-label">挥拍拍点</div><div id="beat-pulse" class="beat-pulse" aria-hidden="true"><div></div></div><div class="beat-summary"><strong id="beat-count">0</strong><span>拍</span></div><p id="beat-age">等待第一次下挥</p><label class="strength-label" for="strength">相对挥拍强度 <span id="strength-value">—</span></label><progress id="strength" max="1" value="0"></progress></div>
      </section>
      <section class="music-panel" aria-label="音乐播放">
        <div class="music-heading"><div><span class="card-label">本地音乐 · 合成音色</span><h2 id="music-title">欢乐颂</h2><p id="music-info">正在加载乐谱…</p></div><strong id="playback-status"></strong></div>
        <div class="actions"><button id="play" class="primary">播放音乐</button><button id="pause" class="secondary">暂停</button><button id="stop" class="secondary">停止并回到开头</button></div>
        <p id="audio-status" role="status"></p><p id="music-error" role="alert" hidden></p>
        <div class="music-controls"><div><label for="tempo-source">速度来源</label><select id="tempo-source"><option value="manual">手动速度</option><option value="conducting">跟随挥拍</option></select></div><div><label for="manual-tempo">手动速度 <span id="manual-tempo-value"></span></label><input id="manual-tempo" type="range" min="${config.minBpm}" max="${config.maxBpm}" value="${config.defaultBpm}" step="1"></div><div><label for="volume">音乐音量 <span id="volume-value"></span></label><input id="volume" type="range" min="${config.minVolumeDb}" max="${config.maxVolumeDb}" value="${config.defaultVolumeDb}" step="1"></div></div>
        <div class="music-progress-label"><span id="music-position"></span><span>音乐速度 <strong id="music-bpm"></strong> BPM</span></div><progress id="music-progress" max="1" value="0" aria-label="音乐循环进度"></progress><p id="follow-status"></p>
      </section>
      <section class="camera-panel" aria-label="左手摄像头控制">
        <div class="music-heading"><div><span class="card-label">左手 · 音量与播放控制</span><h2>抬高变响，降低变轻。</h2></div><strong id="camera-status"></strong></div>
        <div class="camera-layout"><div class="camera-preview"><video id="camera-video" muted playsinline aria-label="摄像头镜像预览"></video><canvas id="camera-overlay" aria-hidden="true"></canvas><span id="camera-placeholder">开启摄像头后，先只举起左手。</span></div><div class="camera-settings">
          <div class="actions"><button id="camera-toggle" class="secondary">开启摄像头</button><button id="bind-left" class="secondary" disabled>确认左手</button></div>
          <p id="camera-notice" role="status">只举起左手，稳定识别后点击“确认左手”；右手暂时离开画面。</p>
          <strong id="hand-status"></strong><p id="hand-reading"></p>
          <label for="volume-source">音量来源</label><select id="volume-source"><option value="manual">手动滑块</option><option value="left-hand">左手高度</option></select>
          <label class="check-label"><input id="gesture-controls" type="checkbox" checked>左手握拳暂停／张掌恢复</label>
          <p id="gesture-reading"></p><progress id="gesture-progress" max="1" value="0" aria-label="手势持续时间"></progress>
          <p class="camera-help">左手握拳或张掌保持约半秒。左手离开画面时保持音量；右手的视觉结果不参与控制。</p>
        </div></div><p id="camera-error" role="alert" hidden></p><p id="camera-stats"></p>
      </section>
      <div class="session-toolbar"><span id="device-model">设备尚未连接</span><button id="export" class="text-button" disabled>导出拍点记录</button></div>
      <details class="diagnostics"><summary>调试记录</summary><div class="debug-toolbar"><button id="raw" class="secondary small">开启六轴数据</button><span id="debug-counts"></span></div><p id="raw-values" class="mono"></p><pre id="event-log" aria-label="最近设备消息"></pre></details>
      <footer>右手给节奏，左手调音量与播放。首次声音启用需点击播放音乐。</footer>
    `;
    view = Object.fromEntries([...root.querySelectorAll('[id]')].map((element) => [element.id, element]));
    views.set(root, view);
  }
  const connected = state.serialPhase === 'connected';
  view['connection-status'].textContent = connectionNames[state.serialPhase] ?? state.serialPhase;
  view['calibration-status'].textContent = calibrationNames[state.calibrationState] ?? state.calibrationState;
  view['detection-status'].textContent = state.detectionActive ? '正在检测' : '未开始';
  view.connect.textContent = state.serialConnected ? '断开设备' : '连接设备';
  view.connect.disabled = !supported || ['connecting', 'disconnecting'].includes(state.serialPhase);
  view.calibrate.disabled = !connected || state.actionPending || state.calibrationState === 'sensor-error';
  view.calibrate.textContent = state.calibrationCountdown !== null ? `${state.calibrationCountdown} 秒后校准` : state.calibrationState === 'calibrating' ? '请保持静止…' : '静止校准';
  view.detect.disabled = !connected || state.actionPending || state.calibrationState !== 'ready';
  view.detect.textContent = state.detectionActive ? '停止检测' : '开始检测';
  view.notice.textContent = supported ? state.notice : '当前浏览器未提供串口连接。请使用支持 Web Serial 的 Chrome 或 Edge 打开本机页面。';
  view.error.hidden = !state.error;
  view.error.textContent = state.error ?? '';
  view.bpm.textContent = state.measuredBpm === null ? '—' : state.measuredBpm.toFixed(1);
  view['tempo-status'].textContent = state.detectionActive ? tempoNames[state.tempoStatus] : '校准完成后开始检测';
  view['beat-count'].textContent = String(state.receivedBeatCount);
  const age = state.lastBeatReceivedAt === null ? null : Math.max(0, now - state.lastBeatReceivedAt);
  view['beat-age'].textContent = age === null ? '等待第一次下挥' : age < 800 ? '刚收到一拍' : `${(age / 1000).toFixed(1)} 秒前收到一拍`;
  view.strength.value = state.lastBeatIntensity;
  view['strength-value'].textContent = age === null ? '—' : `${Math.round(state.lastBeatIntensity * 100)}%`;
  view['device-model'].textContent = state.deviceModel ? `Arduino Uno · ${state.deviceModel}` : '设备尚未连接';
  view.export.disabled = !state.eventLog.length;
  view.raw.disabled = !connected || state.actionPending || state.calibrationState === 'sensor-error';
  view.raw.textContent = state.rawStreamActive ? '关闭六轴数据' : '开启六轴数据';
  view['debug-counts'].textContent = `无效帧 ${state.invalidFrames} · 节奏过滤 ${state.ignoredBeatCount} · 六轴样本 ${state.rawSamples}`;
  view['raw-values'].textContent = state.lastImu ? `加速度 m/s²：${state.lastImu.slice(0, 3).map(v => v.toFixed(3)).join(' / ')}\n角速度 rad/s：${state.lastImu.slice(3).map(v => v.toFixed(3)).join(' / ')}` : '六轴调试数据默认关闭，检测仍会持续采样。';
  view['event-log'].textContent = state.eventLog.slice(-12).map((item) => `${item.at}  ${item.text}`).join('\n');
  view['music-title'].textContent = state.musicInfo?.title ?? config.midiTitle;
  view['music-info'].textContent = state.musicInfo ? `${state.musicInfo.bars} 小节 · ${state.musicInfo.tracks} 条声部 · 循环播放` : state.musicLoadState === 'error' ? '乐谱尚未加载，可点击重试。' : '正在加载乐谱…';
  view['playback-status'].textContent = playbackNames[state.playbackState];
  view.play.disabled = state.musicLoadState === 'loading' || state.audioBusy || state.playbackState === 'playing';
  view.play.textContent = state.audioBusy ? '正在启用声音…' : state.musicLoadState === 'error' ? '重试加载乐谱' : state.playbackState === 'paused' ? '继续播放' : '播放音乐';
  view.pause.disabled = state.playbackState !== 'playing';
  view.stop.disabled = !state.audioBusy && state.playbackState === 'stopped';
  view['audio-status'].textContent = state.audioReady ? '声音已启用；暂停与恢复保留音乐位置，停止回到开头。' : '首次点击播放音乐启用声音，无需连接设备。';
  view['music-error'].hidden = !state.musicError;
  view['music-error'].textContent = state.musicError ?? '';
  view['tempo-source'].value = state.tempoSource;
  view['manual-tempo'].disabled = state.tempoSource !== 'manual';
  view['manual-tempo'].value = String(state.manualBpm);
  view['manual-tempo-value'].textContent = `${state.manualBpm.toFixed(0)} BPM`;
  view.volume.value = String(state.volumeDb);
  view.volume.disabled = state.volumeSource !== 'manual';
  view['volume-value'].textContent = `${state.volumeDb.toFixed(0)} dB`;
  view['music-bpm'].textContent = state.musicBpm.toFixed(1);
  view['music-position'].textContent = state.musicInfo ? `第 ${state.musicBar} / ${state.musicInfo.bars} 小节 · 第 ${state.musicBeat} 拍` : '等待乐谱';
  view['music-progress'].value = state.musicProgress;
  view['follow-status'].textContent = followNames[state.tempoFollowStatus];
  view['camera-status'].textContent = cameraNames[state.cameraPhase];
  view['camera-toggle'].textContent = state.cameraPhase === 'starting' ? '取消开启' : state.cameraReady ? '关闭摄像头' : '开启摄像头';
  view['bind-left'].disabled = !state.cameraReady || !state.handBindingReady;
  view['bind-left'].textContent = state.leftHandBound ? '重新确认左手' : '确认左手';
  view['camera-placeholder'].hidden = state.cameraReady;
  view['camera-notice'].textContent = state.leftHandBound ? '左手已确认。可切换到“左手高度”，右手可继续挥拍。' : state.handBindingReady ? '已稳定识别一只手；确认是你的左手后，点击“确认左手”。' : '只举起左手，稳定识别后点击“确认左手”；右手暂时离开画面。';
  view['hand-status'].textContent = handNames[state.handStatus];
  view['hand-reading'].textContent = state.handTracked ? `左手高度 ${Math.round((1 - state.palmY) * 100)}% · 识别置信度 ${Math.round(state.handednessConfidence * 100)}%` : state.detectedHands ? `画面检测到 ${state.detectedHands} 只手，等待可靠的左手结果。` : '左手抬高增加音量，降低减小音量。';
  view['volume-source'].value = state.volumeSource;
  view['gesture-controls'].checked = state.gestureControlsEnabled;
  view['gesture-reading'].textContent = (gestureNames[state.gesture] ?? '当前手势不控制播放') + (state.gestureControlsEnabled ? ' · 保持约 0.5 秒' : ' · 播放手势已关闭');
  view['gesture-progress'].value = state.gestureProgress;
  view['camera-error'].hidden = !state.cameraError;
  view['camera-error'].textContent = state.cameraError ?? '';
  view['camera-stats'].textContent = state.cameraReady ? `已处理 ${state.cameraFrames} 帧 · 最近识别 ${state.cameraInferenceMs?.toFixed(0) ?? '—'} ms` : '摄像头可独立于 Arduino 使用。';
  return view;
}

export function pulseBeat(view, intensity) {
  view['beat-pulse'].animate([
    { transform: 'scale(1)', boxShadow: '0 0 0 0 #80e9ce66' },
    { transform: `scale(${1.08 + intensity * 0.12})`, boxShadow: '0 0 0 18px #80e9ce00' },
    { transform: 'scale(1)', boxShadow: '0 0 0 24px #80e9ce00' },
  ], { duration: 360, easing: 'ease-out' });
}
