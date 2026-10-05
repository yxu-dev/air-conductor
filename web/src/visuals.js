export function renderStatus(root, state) {
  root.innerHTML = `
    <h1>Air Conductor</h1>
    <p>项目骨架已建立，交互功能待实现。</p>
    <dl>
      <dt>Arduino</dt><dd>${state.serialConnected ? '已连接' : '未连接'}</dd>
      <dt>摄像头</dt><dd>${state.cameraReady ? '已启动' : '未启动'}</dd>
      <dt>音频</dt><dd>${state.audioReady ? '已启动' : '未启动'}</dd>
      <dt>MIDI</dt><dd>${state.midiLoaded ? '已加载' : '未加载'}</dd>
    </dl>
  `;
  // TODO: Live state rendering, beat pulses and hand trails.
}
