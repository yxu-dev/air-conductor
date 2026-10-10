# Air Conductor：完整中文实现流程
> dev-3 当前进度：正式界面已接入 Tailwind CSS 4.3.3 和 Three.js 0.186.1，使用真实 WebGL 绘制光环、粒子、左手轨迹及拍点强度脉冲。提供 Aurora / Nocturne 配色与减少动态效果，支持画面降级、GPU 上下文恢复和资源释放。68 项逻辑检查、15 项浏览器检查、7 项正式构建检查通过。本阶段未启动摄像头、串口或实机动作测试；README 和正式界面保持英文，开发文档及 recordings 继续保留在开发分支，正式发布时再移出交付树。

> dev-2 当前进度：正式英文演奏界面已实现，包括 Conduct / Listen 模式、四步准备引导、统一 Start / Pause / Resume / End / Reset、左手淡出轨迹、真实拍点与强度反馈、全屏和响应式布局。设备设置、CSV 导出和诊断收纳在折叠面板中。核心硬件与音乐算法沿用 dev-1；新版入口尚未开展新的实机用户测试。此文保留实现过程，正式发布时按约定移出交付树。

> 项目定位：Arduino Uno + MPU-6050 可穿戴手腕控制器 + Windows PC 摄像头 + 浏览器 MIDI 合成/可视化  
> 最终交互：**右手挥拍速度 → Tempo；左手高度 → Volume；左手握拳 → Pause；左手张开手掌 → Resume；右手挥拍强度 → 视觉强度（可选进一步映射到 musical accent）**  
> 最终展示环境建议：**Windows + Chrome / Microsoft Edge + 本地 Vite 服务**  
> 本文以已提交 Proposal 和教授反馈为基础，将实现路径收敛为 **MIDI + browser synth**，不再采用 audio loop + time-stretch/vocoder 路线。

---

## 0. 最终技术选择先冻结

### 0.1 最终系统架构

双手分工：右手佩戴 IMU，负责挥拍节奏与强度；摄像头追踪左手，负责音量及暂停/恢复。两只手同时进入画面时，仅左手的视觉结果进入控制链路，右手的摄像头结果不控制音量或播放状态。音量平滑用于减少左手追踪抖动，节奏与音量的分离由双手分工实现。

```text
Right wrist MPU-6050
   │  I2C
   ▼
Arduino Uno
   │  stroke detection
   │  beat timestamp + intensity
   ▼
USB Serial
   │
   ▼
Browser / JavaScript
   ├──────────────► BPM estimator ─────────► Tone.js Transport
   │                                         │
   │                                         ▼
   │                                MIDI event scheduler
   │                                         │
   │                                         ▼
   │                                Tone.js Synth / Sampler
   │                                         │
   │                                         ▼
   │                                      Speakers
   │
Webcam
   │
   ▼
MediaPipe Gesture Recognizer
   │  select LEFT hand; ignore RIGHT hand
   ├── left palm Y position ───────────► master volume
   ├── left Closed_Fist (held) ────────► pause
   └── left Open_Palm (held) ──────────► resume

All states/events
   │
   └───────────────────────────────────► HTML/CSS + Canvas/Three.js visuals
```

### 0.2 明确不做的东西

本项目最终版不需要：

- Unity：除非所有核心功能已经完成并且还有大量时间，否则不做。
- 传统 VST host：浏览器内直接使用 Tone.js synth 即可，不要再引入 DAW/VST hosting。
- 音频 loop + playback-rate：会把 tempo 和 pitch 绑在一起，需要 vocoder/time-stretching，复杂度和 artifact 风险都更高。
- Web MIDI API：这里的 MIDI 是**音乐文件格式与 timing representation**，不是连接实体 MIDI 键盘，因此不需要 Web MIDI API。
- Python 作为最终运行时：Python 只作为开发期诊断工具；展览最终版保持 Arduino + Browser。

---

## 1. 需要的硬件与接线

### 1.1 硬件

- Arduino Uno
- MPU-6050 breakout/module
- USB A-B 数据线
- 4 根 jumper wires
- MPU-6050 手腕固定带
- Arduino 前臂固定带
- Velcro / 松紧带 / 胶带
- Arduino 下方的薄泡沫或硬纸板背板
- Windows PC，带摄像头和扬声器

### 1.2 MPU-6050 → Arduino Uno

按照当前 Proposal 图：

| MPU-6050 | Arduino Uno |
|---|---|
| VCC | 5V **或模块明确要求的供电电压** |
| GND | GND |
| SDA | A4 |
| SCL | A5 |
| XDA | 不接 |
| XCL | 不接 |
| AD0 | 不接 |
| INT | 不接 |

Arduino Uno 上的 A4/A5 分别作为 SDA/SCL 使用。

**供电必须以你手上 breakout module 的丝印/数据手册为准。**  
如果模块明确写 `VCC 3–5V`，可以按模块说明供电；如果是只允许 3.3V 的裸芯片式板，不要直接接 5V。

Arduino 通过 USB A-B 同时获得供电并向电脑发送 serial data。

### 1.3 可穿戴固定

MPU-6050 固定在右手手腕附近，Arduino 放在右前臂更靠上的位置；左手不佩戴传感器，由摄像头追踪。重点不是外观，而是：

1. MPU-6050 不能在带子里晃动，否则传感器看到的是“模块晃动”而不是“手腕运动”。
2. 在传感器外壳/胶带上画一个固定方向箭头，确保每次佩戴方向接近一致。
3. USB 线要沿前臂固定一小段，形成 strain relief，避免线直接拉扯 Arduino USB 口。
4. 展示时确保 USB 线足够长，不让参与者挥手时拉动电脑。

---

## 2. 软件栈与官方链接

### 2.1 Arduino 端

**Adafruit MPU6050 Arduino Library**  
https://github.com/adafruit/Adafruit_MPU6050

在 Arduino IDE：

```text
Tools / Sketch → Include Library → Manage Libraries
搜索：Adafruit MPU6050
安装
```

该库还会使用 Adafruit 的依赖库，Library Manager 通常会提示一起安装。

### 2.2 浏览器音频与 MIDI

**Tone.js**  
主页：https://tonejs.github.io/  
文档：https://tonejs.github.io/docs/  
GitHub：https://github.com/Tonejs/Tone.js

安装：

```bash
npm install tone
```

Tone.js 提供：

- Transport
- BPM control
- musical-time scheduling
- Synth / PolySynth
- Gain / Volume
- loop
- pause / resume

**@tonejs/midi**  
GitHub：https://github.com/Tonejs/Midi

安装：

```bash
npm install @tonejs/midi
```

主要用途：

```js
import { Midi } from "@tonejs/midi";

const midi = await Midi.fromUrl("/midi/ode.mid");
```

解析后可以获得：

```text
midi.header.ppq
midi.tracks
track.notes
note.name
note.velocity
note.ticks
note.durationTicks
```

这里实现动态 tempo 时，**优先使用 ticks，而不是直接用 note.time 秒数**。  
原因是 ticks 是音乐时间；Tone.js Transport 的 BPM 改变后，tick-based schedule 会自然随 tempo 改变。

### 2.3 Webcam / 手势识别

推荐直接使用 **MediaPipe Gesture Recognizer**，而不是自己从 21 个 landmarks 手写“拳头/张手”分类器。

官方 Web 指南：  
https://developers.google.com/edge/mediapipe/solutions/vision/gesture_recognizer/web_js

NPM：

```bash
npm install @mediapipe/tasks-vision
```

官方 Gesture Recognizer 本身就包含：

```text
Closed_Fist
Open_Palm
Pointing_Up
Thumb_Down
Thumb_Up
Victory
ILoveYou
```

因此本项目只需要：

```text
Left Closed_Fist → Pause
Left Open_Palm   → Resume
```

同时 Gesture Recognizer 会输出 handedness 与 hand landmarks，因此不需要额外再跑一套 Hand Landmarker；先选择左手，再从同一只手的 landmarks 得到手掌高度。右手即使进入画面，也不参与视觉控制。

官方模型：

https://storage.googleapis.com/mediapipe-tasks/gesture_recognizer/gesture_recognizer.task

### 2.4 Arduino → Browser

使用浏览器内置的 **Web Serial API**，不需要额外 NPM 库。

MDN：  
https://developer.mozilla.org/en-US/docs/Web/API/Web_Serial_API

最终展示固定使用：

```text
Chrome 或 Microsoft Edge
```

不要把跨浏览器兼容当作本项目目标。

Web Serial 需要 secure context。开发时使用：

```text
http://localhost:xxxx
```

而不是双击 `index.html` 用 `file://` 打开。

### 2.5 Web 项目脚手架

推荐 **Vite**：

https://vite.dev/

创建项目：

```bash
npm create vite@latest air-conductor-web -- --template vanilla
cd air-conductor-web
npm install
npm install tone @tonejs/midi @mediapipe/tasks-vision
```

Three.js 是可选视觉扩展：

```bash
npm install three
```

**MVP 不需要 Three.js。**  
先用 HTML/CSS + Canvas 2D 把 pulse、trail、BPM、volume、state 做出来；核心体验完成后再决定是否升级。

---

## 3. MIDI 文件：建议直接使用本地文件

教授的建议是 MIDI，因此最终项目不再使用普通 audio loop。

### 3.1 首选：Ode to Joy

Mutopia 页面：

https://www.mutopiaproject.org/cgibin/piece-info.cgi?id=528

该页面将版本标为 Public Domain。

直接 MIDI：

https://www.mutopiaproject.org/ftp/BeethovenLv/ode/ode.mid

推荐下载到：

```text
air-conductor-web/public/midi/ode.mid
```

Windows PowerShell 可以尝试：

```powershell
New-Item -ItemType Directory -Force public\midi
Invoke-WebRequest `
  -Uri "https://www.mutopiaproject.org/ftp/BeethovenLv/ode/ode.mid" `
  -OutFile "public\midi\ode.mid"
```

如果命令行下载失败，直接在浏览器打开上面的 MIDI URL 下载，然后手动重命名为：

```text
ode.mid
```

### 3.2 备选：Für Elise

Mutopia 页面：

https://www.mutopiaproject.org/cgibin/piece-info.cgi?id=931

直接 MIDI：

https://www.mutopiaproject.org/ftp/BeethovenLv/WoO59/fur_Elise_WoO59/fur_Elise_WoO59.mid

### 3.3 最终建议

开发阶段先使用 **Ode to Joy**，原因是：

- 容易听出 tempo 是否真的变化；
- 旋律熟悉，展示者和观众能立即理解控制效果；
- 比复杂交响曲更容易调试；
- Public Domain 来源清晰。

如果 MIDI 太长，后续可以用 MuseScore 打开并截取 8–16 小节，再导出：

```text
air_conductor_demo.mid
```

MuseScore：

https://musescore.org/

**展览时不要在线读取 Mutopia。**  
MIDI 必须提前下载并放进项目本地。

---

## 4. 推荐项目目录

```text
AirConductor/
│
├─ arduino/
│  └─ AirConductor_IMU/
│     └─ AirConductor_IMU.ino
│
├─ diagnostics/
│  └─ read_serial.py
│
└─ web/
   ├─ package.json
   ├─ package-lock.json
   ├─ index.html
   ├─ public/
   │  ├─ midi/
   │  │  └─ ode.mid
   │  ├─ models/
   │  │  └─ gesture_recognizer.task
   │  └─ mediapipe/
   │     └─ wasm/
   │
   └─ src/
      ├─ main.js
      ├─ serial.js
      ├─ tempo.js
      ├─ audio.js
      ├─ vision.js
      ├─ visuals.js
      └─ style.css
```

逻辑职责：

```text
serial.js  → Arduino/Web Serial
tempo.js   → beat interval → robust BPM
audio.js   → MIDI + Tone.js
vision.js  → webcam + left-hand selection + left palm height + left fist/open
visuals.js → pulse/trail/status
main.js    → 状态整合
```

这样比把所有代码写在一个 `main.js` 中更容易 debug。

---

# 5. 实现顺序

不要从“最终漂亮界面”开始。

正确顺序：

```text
Step 1  MPU6050 能稳定读数
Step 2  Arduino 能可靠识别一次 stroke = 一个 beat
Step 3  USB serial 能在电脑稳定收到 beat
Step 4  浏览器独立播放 MIDI
Step 5  手动 slider 改 BPM 能实时改变 MIDI tempo
Step 6  Arduino beat interval 接管 BPM
Step 7  Webcam 检测手部，确认并筛选左手，忽略右手结果
Step 8  左手 Closed_Fist / Open_Palm 控制 pause/resume
Step 9  左手掌高度控制 volume
Step 10 加视觉反馈
Step 11 最终 integration / tuning
Step 12 展示机离线化、固定版本、压力测试
```

---

# 6. Stage A：Arduino 先只验证 MPU-6050

先不要写 beat detection。

目标：

```text
Arduino Serial Monitor
↓
ax ay az gx gy gz
```

最小测试代码结构：

```cpp
#include <Wire.h>
#include <Adafruit_MPU6050.h>
#include <Adafruit_Sensor.h>

Adafruit_MPU6050 mpu;

void setup() {
  Serial.begin(115200);

  if (!mpu.begin()) {
    Serial.println("MPU6050_NOT_FOUND");
    while (1) delay(10);
  }

  mpu.setAccelerometerRange(MPU6050_RANGE_8_G);
  mpu.setGyroRange(MPU6050_RANGE_500_DEG);
  mpu.setFilterBandwidth(MPU6050_BAND_21_HZ);
}

void loop() {
  sensors_event_t a, g, temp;
  mpu.getEvent(&a, &g, &temp);

  Serial.print(a.acceleration.x); Serial.print(",");
  Serial.print(a.acceleration.y); Serial.print(",");
  Serial.print(a.acceleration.z); Serial.print(",");
  Serial.print(g.gyro.x); Serial.print(",");
  Serial.print(g.gyro.y); Serial.print(",");
  Serial.println(g.gyro.z);

  delay(10);  // ~100 Hz
}
```

完成条件：

- 静止时数据稳定；
- 快速挥手有明显峰值；
- 传感器在绑带上时和手一起动，不是自己松动；
- 连续运行 5 分钟不掉线。

---

# 7. Stage B：实现 stroke / beat detection

## 7.1 第一版不要追求复杂姿态估计

MVP 推荐做 **motion-energy peak detection**。

原因：

- 不需要知道 MPU 每次佩戴的精确世界坐标；
- 不需要做完整 sensor fusion；
- final 的目标是“明显 conducting stroke”，不是精确重建 3D 手腕姿态。

计算：

```text
accelMagnitude = sqrt(ax² + ay² + az²)
dynamicAccel   = abs(accelMagnitude - 9.81)

gyroMagnitude  = sqrt(gx² + gy² + gz²)

motionScore =
    dynamicAccel
    + K * gyroMagnitude
```

其中 `K` 只用于把 gyro 的数值尺度调到合理范围。

## 7.2 用状态机防止一个大动作被重复计数

```text
READY
  │
  │ score > HIGH
  ▼
IN_STROKE
  │
  │ 记录 peakScore
  │
  │ score < LOW 且超过最短 stroke duration
  ▼
REFRACTORY
  │
  │ 距离上一个 beat > MIN_GAP
  ▼
READY
```

起始可调参数：

```text
sampling rate       ≈ 100 Hz
MIN_GAP             ≈ 250–300 ms
HIGH threshold      通过实测调
LOW threshold       HIGH 的约 40%–60%
```

不要直接照搬某个固定 threshold；先看自己的 Serial Plotter。

## 7.3 输出协议

Arduino 最终不持续发送全部 raw IMU 数据，只在识别到 beat 时输出事件。

推荐：

```text
BEAT,<timestamp_ms>,<intensity>
```

例如：

```text
BEAT,18342,0.71
BEAT,18865,0.64
BEAT,19380,0.82
```

其中：

```text
timestamp_ms = millis()
intensity    = 0.0–1.0
```

调试模式可以额外输出：

```text
DEBUG,<motionScore>
```

final 展示时关闭 DEBUG，避免 serial 数据太多。

## 7.4 Arduino 核心伪代码

```cpp
enum StrokeState {
  READY,
  IN_STROKE
};

StrokeState state = READY;

unsigned long lastBeatMs = 0;
float peakScore = 0;

void processMotion(float score) {
  unsigned long now = millis();

  if (state == READY) {
    if (score > HIGH_THRESHOLD &&
        now - lastBeatMs > MIN_GAP_MS) {
      state = IN_STROKE;
      peakScore = score;
    }
  }
  else if (state == IN_STROKE) {
    if (score > peakScore) {
      peakScore = score;
    }

    if (score < LOW_THRESHOLD) {
      float intensity = normalizeIntensity(peakScore);

      Serial.print("BEAT,");
      Serial.print(now);
      Serial.print(",");
      Serial.println(intensity, 3);

      lastBeatMs = now;
      peakScore = 0;
      state = READY;
    }
  }
}
```

### 7.5 可选增强：方向 gate

如果第一版把很多无关动作也识别成 beat，再做这一层。

方法：

1. 固定 MPU 的佩戴方向。
2. 在 Serial Plotter 看真正 downward/forward stroke 最明显的是哪个轴。
3. 要求该轴达到指定符号/幅度，才允许 motion peak 变成 beat。

例如：

```text
motion score 足够高
AND
primaryAxis < negative threshold
```

不要一开始就做复杂 3D orientation。

---

# 8. Stage C：用 Python 做一次 serial 诊断

这一步只用于开发，不用于 final。

安装：

```bash
pip install pyserial
```

`diagnostics/read_serial.py`：

```python
import serial

ser = serial.Serial("COM3", 115200, timeout=1)

while True:
    line = ser.readline().decode("utf-8", errors="ignore").strip()
    if line:
        print(line)
```

完成条件：

```text
正常挥拍 → 每次大致一个 BEAT
静止 → 不出现 BEAT
普通小动作 → 很少误触发
连续挥拍 → 不漏掉大量 beat
```

如果这一层不稳定，不要继续做网页。

---

# 9. Stage D：建立浏览器项目

进入 `web/`：

```bash
npm create vite@latest . -- --template vanilla
npm install
npm install tone @tonejs/midi @mediapipe/tasks-vision
npm run dev
```

打开终端显示的 localhost 地址。

先在页面做 4 个状态：

```text
Arduino: Disconnected
Camera: Off
MIDI: Not loaded
Audio: Locked
```

后续所有模块工作后分别变绿。

---

# 10. Stage E：先独立完成 MIDI 播放

这一阶段完全不连接 Arduino 和 Webcam。

## 10.1 浏览器 Audio Context 必须由用户点击启动

页面提供：

```text
[Start Audio]
```

事件：

```js
await Tone.start();
```

不要期待网页一打开就自动播放。

## 10.2 加载 MIDI

```js
import * as Tone from "tone";
import { Midi } from "@tonejs/midi";

const midi = await Midi.fromUrl("/midi/ode.mid");
```

## 10.3 关键：按 MIDI ticks 排程

推荐逻辑：

```js
const transport = Tone.getTransport();

transport.PPQ = midi.header.ppq;
transport.bpm.value =
  midi.header.tempos?.[0]?.bpm ?? 100;
```

建立简单 synth：

```js
const masterVolume = new Tone.Volume(-10).toDestination();

const synth = new Tone.PolySynth(Tone.Synth).connect(masterVolume);
```

排程：

```js
midi.tracks.forEach(track => {
  if (track.instrument?.percussion) return;

  track.notes.forEach(note => {
    transport.schedule((time) => {
      synth.triggerAttackRelease(
        note.name,
        `${note.durationTicks}i`,
        time,
        note.velocity
      );
    }, `${note.ticks}i`);
  });
});
```

loop：

```js
transport.loop = true;
transport.loopStart = 0;
transport.loopEnd = `${midi.durationTicks}i`;
```

开始：

```js
transport.start();
```

暂停：

```js
transport.pause();
```

恢复：

```js
transport.start();
```

停止并回到开头：

```js
transport.stop();
transport.position = 0;
```

## 10.4 为什么不用 `note.time`

`note.time` 是根据 MIDI 原 tempo 换算后的秒数。

如果所有事件都按照绝对秒 schedule，后续改变 BPM 不一定会得到你想要的“音乐时间整体缩放”。

本项目需要：

```text
MIDI ticks
   ↓
Tone Transport musical timeline
   ↓
Transport BPM continuously changes
```

这是 tempo control 的关键。

## 10.5 先做一个人工 BPM slider

页面：

```text
Tempo: 100 BPM
[ 50 ------------------ 180 ]
```

slider：

```js
transport.bpm.rampTo(newBpm, 0.2);
```

完成条件：

- BPM 80 → 120 → 160 时，旋律音高不变；
- 播放不会重启；
- pause 后 resume 能从当前位置继续。

**只有这个测试完成，才接 Arduino。**

---

# 11. Stage F：Web Serial

`serial.js` 只负责连接、读取和 line parsing。

## 11.1 连接按钮

网页必须提供：

```text
[Connect Arduino]
```

因为浏览器 serial permission 需要用户交互。

示意：

```js
export async function connectArduino(onLine) {
  const port = await navigator.serial.requestPort();

  await port.open({
    baudRate: 115200
  });

  const decoder = new TextDecoderStream();
  const inputDone = port.readable.pipeTo(decoder.writable);
  const reader = decoder.readable.getReader();

  let buffer = "";

  while (true) {
    const { value, done } = await reader.read();
    if (done) break;

    buffer += value;

    let idx;
    while ((idx = buffer.indexOf("\n")) >= 0) {
      const line = buffer.slice(0, idx).trim();
      buffer = buffer.slice(idx + 1);

      if (line) onLine(line);
    }
  }
}
```

## 11.2 Parse BEAT

```js
function parseArduinoLine(line) {
  const p = line.split(",");

  if (p[0] !== "BEAT") return null;

  return {
    type: "beat",
    timestampMs: Number(p[1]),
    intensity: Number(p[2])
  };
}
```

UI 同时显示：

```text
Arduino ● Connected
Last beat: 12 ms ago
Intensity: 0.71
```

---

# 12. Stage G：从 beat interval 得到 BPM

不要直接用一次 interval：

```text
BPM = 60000 / latestInterval
```

否则一个误触发会让音乐突然跳速。

## 12.1 推荐算法

保留最近 5 个有效 interval：

```text
beat 1
beat 2 → interval 1
beat 3 → interval 2
...
```

先过滤：

```text
MIN_BPM = 50
MAX_BPM = 180

minInterval = 60000 / 180 ≈ 333 ms
maxInterval = 60000 / 50  = 1200 ms
```

不在范围内的 interval 不参与 tempo estimation。

然后：

```text
medianInterval = median(last 5 valid intervals)

rawBpm = 60000 / medianInterval
```

最后平滑：

```text
smoothedBpm =
    previousBpm * 0.75
    + rawBpm * 0.25
```

再更新 Tone：

```js
transport.bpm.rampTo(smoothedBpm, 0.2);
```

## 12.2 `tempo.js` 示例结构

```js
const intervals = [];

let lastBeatTimestamp = null;
let currentBpm = 100;

export function onBeat(timestampMs) {
  if (lastBeatTimestamp == null) {
    lastBeatTimestamp = timestampMs;
    return currentBpm;
  }

  const dt = timestampMs - lastBeatTimestamp;
  lastBeatTimestamp = timestampMs;

  if (dt < 333 || dt > 1200) {
    return currentBpm;
  }

  intervals.push(dt);

  while (intervals.length > 5) {
    intervals.shift();
  }

  if (intervals.length < 3) {
    return currentBpm;
  }

  const sorted = [...intervals].sort((a, b) => a - b);
  const median = sorted[Math.floor(sorted.length / 2)];

  const rawBpm = 60000 / median;

  currentBpm =
    0.75 * currentBpm +
    0.25 * rawBpm;

  return currentBpm;
}
```

## 12.3 没有 beat 时怎么办

如果参与者停止挥手：

```text
不要把 BPM 自动拉回默认值。
```

直接 hold 当前 BPM。

这会让体验更自然。

---

# 13. Stage H：MediaPipe Gesture Recognizer

## 13.1 开发期可先用 CDN WASM

官方示例会使用：

```text
@mediapipe/tasks-vision
+
gesture_recognizer.task
```

最终展示建议把模型和 WASM 放本地，避免 Performance Cafe 网络不稳定。

模型下载：

https://storage.googleapis.com/mediapipe-tasks/gesture_recognizer/gesture_recognizer.task

保存：

```text
public/models/gesture_recognizer.task
```

### 本地 WASM

可以把 package 中的 WASM 复制到：

```text
public/mediapipe/wasm/
```

Windows PowerShell 示例：

```powershell
New-Item -ItemType Directory -Force public\mediapipe
Copy-Item `
  -Recurse `
  node_modules\@mediapipe\tasks-vision\wasm `
  public\mediapipe\wasm
```

## 13.2 初始化

示意：

```js
import {
  FilesetResolver,
  GestureRecognizer
} from "@mediapipe/tasks-vision";

const vision = await FilesetResolver.forVisionTasks(
  "/mediapipe/wasm"
);

const recognizer =
  await GestureRecognizer.createFromOptions(
    vision,
    {
      baseOptions: {
        modelAssetPath:
          "/models/gesture_recognizer.task"
      },
      runningMode: "VIDEO",
      numHands: 2,
      minHandDetectionConfidence: 0.6,
      minHandPresenceConfidence: 0.6,
      minTrackingConfidence: 0.6,
      cannedGesturesClassifierOptions: {
        categoryAllowlist: ["Open_Palm", "Closed_Fist"]
      }
    }
  );
```

## 13.3 摄像头

```js
const stream =
  await navigator.mediaDevices.getUserMedia({
    video: {
      width: 1280,
      height: 720
    },
    audio: false
  });

video.srcObject = stream;
await video.play();
```

requestAnimationFrame loop：

```js
const result =
  recognizer.recognizeForVideo(
    video,
    performance.now()
  );
```

## 13.4 只选择左手作为视觉控制输入

`numHands: 2` 允许两只手同时被检测，控制输入仍只有左手。不能直接取 `result.landmarks[0]` 或 `result.gestures[0]`，因为第一组结果可能属于正在挥拍的右手。使用同一索引的 `handedness`、`landmarks` 和 `gestures` 选择左手；这些输出见 [MediaPipe 官方 Web 指南](https://developers.google.com/edge/mediapipe/solutions/vision/gesture_recognizer/web_js)。

开始使用前，请参与者仅举起生理左手，核对页面标记；再分别举右手及双手，确认右手不会接管。预览是否镜像不能作为生理左右手的判断依据。若当前推理输入的左右标签与实手不一致，应在输入处理或标签映射处统一修正，并重新验证。下面的 `leftLabel` 必须对应已经确认的生理左手，通常为 `Left`。

示意选择函数：

```js
function selectLeftHand(
  result,
  { leftLabel = "Left", minScore = 0.7 } = {}
) {
  const candidates = [];
  for (let i = 0; i < result.handedness.length; i++) {
    const side = result.handedness[i][0];
    if (
      side?.categoryName === leftLabel &&
      side.score >= minScore &&
      result.landmarks[i]?.length === 21
    ) {
      candidates.push({
        landmarks: result.landmarks[i],
        gesture: result.gestures[i]?.[0] ?? null,
        handednessConfidence: side.score
      });
    }
  }
  // No confident left hand or ambiguous results: do not select another hand.
  return candidates.length === 1 ? candidates[0] : null;
}

const leftHand = selectLeftHand(result);
```

选择结果为空、左右置信度不足或选择存在歧义时，进入左手丢失状态：保持最后音量，清除尚未完成的手势确认计数，不触发暂停/恢复。即使画面中仍有右手，也不能改用右手结果。手势识别沿用 Lab4 的两类别 allowlist；握拳阈值 0.65，张掌根据 2026-10-10 实测分数调整为 0.55，并增加确认次数。左右手选择的 0.7 阈值单独保留。

---

# 14. Stage I：left palm height → volume

仅在上一阶段得到有效 `leftHand` 时更新音量。Gesture Recognizer 返回的其他手部结果不进入音量计算。

不要直接用某一根指尖作为高度，因为手指张开/握拳时指尖位置会发生大幅改变。

更稳的是计算左手 palm center：

```text
landmark 0  = wrist
landmark 5  = index MCP
landmark 9  = middle MCP
landmark 13 = ring MCP
landmark 17 = pinky MCP
```

平均：

```js
const landmarks = leftHand.landmarks;
const ids = [0, 5, 9, 13, 17];

const palmY =
  ids.reduce(
    (s, i) => s + landmarks[i].y,
    0
  ) / ids.length;
```

MediaPipe normalized Y：

```text
0 = 画面顶部
1 = 画面底部
```

因此：

```text
左手越高 → Y 越小 → 音量越大
```

## 14.1 映射范围

不要使用完整 0–1。

例如：

```text
cameraTop    = 0.20
cameraBottom = 0.80

0.20 → -3 dB
0.80 → -30 dB
```

clamp：

```js
function clamp(x, lo, hi) {
  return Math.max(lo, Math.min(hi, x));
}
```

映射：

```js
const y =
  clamp(
    (palmY - 0.20) / (0.80 - 0.20),
    0,
    1
  );

const targetDb =
  -3 + y * (-27);
```

Tone：

```js
masterVolume.volume.rampTo(
  targetDb,
  0.10
);
```

## 14.2 再做一点 smoothing

```text
smoothedY =
  0.85 * previousY
  + 0.15 * currentY
```

否则 volume 会跟着左手视觉 landmark jitter 抖动。右手挥拍造成的高度变化不进入这一计算；无需用右手挥拍周期的平均高度控制音量。

音乐暂停时保持当前音量；恢复后再平滑跟随左手高度。保留手动音量滑块与“手动/左手手势”来源切换，手动模式下视觉结果不写入音量。

---

# 15. Stage J：左手 Closed_Fist / Open_Palm → Pause / Resume

仅使用已筛选左手的手势类别；右手握拳或张掌不触发播放控制。不要识别到一帧就执行。

采用 Lab4 的连续新结果确认方式：握拳连续 3 次有效新结果后执行；张掌降低接受阈值后要求连续 5 次。用户保持姿势直到识别稳定；不再额外要求连续 500 ms。2026-10-10 用户完成 3 轮基础复测，暂停、恢复各 3 次成功且位置连续。后续用户确认仅右手出现不误控、左手丢失保持音量与播放、摄像头重开后需重新确认且控制恢复。`23-11-28.csv` 的 8 对暂停/恢复 tick 一致，18 段丢失区间无音量或播放操作；重开后的重新确认按用户反馈记录。IMU/摄像头两段基本联动也已通过：`23-22-05.csv` 记录 116 条 BEAT，音乐目标约 63–137 BPM，12 对暂停/恢复 tick 一致，暂停期间仍可接收拍点。双手同框/交叉及音量稳定性定量检查待完成。

## 15.1 Gesture debounce

状态：

```text
candidateGesture
candidateCount
stableGesture
```

例如：

```text
左手 Closed_Fist，置信度 ≥ 0.65，连续 3 次新结果
→ pause

左手 Open_Palm，置信度 ≥ 0.55，连续 5 次新结果
→ resume
```

如果中间变成 `None`、其他 gesture、手势置信度不足，或左手丢失，就重置确认计数。重复或倒退的结果时间戳不增加计数，推理帧间隔超过 250 ms 也重置候选。不得把右手的结果或失踪前后的两段结果累计为一次确认。

## 15.2 操作必须 idempotent

```js
if (
  stableGesture === "Closed_Fist" &&
  state.playbackState === "playing"
) {
  music.pause();
}

if (
  stableGesture === "Open_Palm" &&
  state.playbackState === "paused"
) {
  void music.play();
}
```

上述 `stableGesture` 来自左手筛选及连续结果确认。实际接入现有播放器时，通过音乐会话的 `pause()` / `play()` 入口执行，保留暂停位置及静音管理。如果音乐已经在播放，左手持续 Open_Palm 不应该重复触发任何副作用；手势恢复只用于暂停状态，初次声音启用仍需页面播放按钮。

## 15.3 左手离开镜头

如果没有可靠的左手结果，包括画面中仅剩右手：

```text
0–500 ms：
保持最后一个 volume 值

>500 ms：
UI 显示 LEFT HAND LOST
```

保持最后音量，不因 tracking loss 自动暂停音乐；右手 IMU 的节奏输入仍独立有效。左手重新出现后重新开始手势确认计数，并平滑恢复高度控制。

---

# 16. Stage K：Intensity 的使用方式

### MVP

stroke intensity 只控制视觉：

```text
weak stroke   → 小 pulse
strong stroke → 大 pulse
```

这是最稳的。

### Enhancement

后续可以让最近一次 stroke intensity 调制 musical accent。

例如：

```text
effectiveVelocity =
  originalMidiVelocity
  × intensityMultiplier
```

但这会涉及“某次 beat 应该影响哪些音符”的 timing 绑定，因此不是第一优先级。

**顺序必须是：先保证 tempo、volume、pause/resume 全部稳定，再加 accent。**

---

# 17. Stage L：视觉界面

## 17.1 MVP UI

至少显示：

```text
AIR CONDUCTOR

Tempo
124 BPM

Volume
████████░░

Playback
PLAYING / PAUSED

Arduino
CONNECTED

Left Hand
TRACKED / LOST

Left Gesture
OPEN_PALM / CLOSED_FIST / NONE
```

中央视觉：

```text
left palm trail
+
beat pulse
```

### Beat pulse

收到 Arduino beat：

```text
pulse radius = base + intensity × scale
```

然后在 200–300 ms 内衰减。

### Trail

使用已筛选左手的 palm center：

```text
(x, y)
```

保存最近 20–40 帧，画成逐渐消失的线。

MVP 用 Canvas 2D 足够。

---

# 18. `main.js` 的最终事件关系

```text
START PAGE
  │
  ├── Start Audio
  ├── Start Camera
  └── Connect Arduino
        │
        ▼
     SYSTEM READY
```

Arduino：

```text
serial line
  ↓
parse BEAT
  ↓
visual beat pulse
  ↓
tempo estimator
  ↓
Tone Transport BPM
```

Camera：

```text
frame
  ↓
Gesture Recognizer
  ↓
select verified LEFT hand; ignore RIGHT hand
  ├── left palm Y → smoothed volume
  ├── left Closed_Fist hold → pause
  ├── left Open_Palm hold → resume
  └── left palm XY → trail
```

Audio：

```text
MIDI ticks
  ↓
Transport
  ↓
PolySynth
  ↓
Master Volume
  ↓
Speakers
```

---

# 19. 推荐的前端状态对象

不要让各个模块直接互相改 DOM。

可以在 `main.js` 维护：

```js
const state = {
  serialConnected: false,
  cameraReady: false,
  controlledHand: "Left",       // Physical left hand after input-label verification.
  handTracked: false,            // A reliable left-hand result, not any visible hand.
  handednessConfidence: 0,

  playbackState: "stopped",

  bpm: 100,
  volumeDb: -12,

  lastBeatIntensity: 0,

  gesture: "None",

  palmX: 0.5,
  palmY: 0.5
};
```

模块更新 state，render loop 统一画 UI。

这样后续 debug 会简单很多。

---

# 20. 调参顺序

每次只调一个子系统。

### A. Beat detection

目标：

```text
10 次明显挥拍
→ 8–10 次有效 beat
→ 几乎不 double-count
```

优先避免 double-count；少量漏拍比一个动作触发 2–3 次更容易处理。

### B. Tempo estimator

测试：

```text
60 BPM 手动挥拍
90 BPM
120 BPM
150 BPM
```

观察 UI 是否在几次 stroke 后稳定靠近目标。

### C. Camera

分别测试：

```text
左手在顶部 / 中部 / 底部 → 音量按高度变化
左手握拳 1 秒 → 暂停
左手张掌 1 秒 → 恢复
左手保持静止，右手快速挥拍 → 音量基本保持
左手保持张掌，右手握拳 → 不触发暂停
画面中仅剩右手 → 左手丢失，不接管控制
左手丢失后重新出现 → 手势确认计数重新开始
双手同时进入画面 / 交叉 → 左右选择不确定时保持音量
```

### D. Integration

重点测试：

```text
右手快速 conducting、左手保持静止时
是否仍只用左手控制音量和暂停/恢复？

右手持续挥拍、左手改变高度或握拳时
两条输入链路是否独立生效？

USB cable 移动时
Arduino 是否掉线？

CPU 占用高时
音频是否 crackle？

camera lost 1–2 帧时
音量是否突然跳？
```

---

# 21. Show-case 前必须做离线化

开发阶段可以用 CDN，但 final 不建议依赖现场网络。

最终本地化：

```text
Tone.js             → npm bundle
@tonejs/midi        → npm bundle
MediaPipe JS        → npm bundle
MediaPipe WASM      → public/mediapipe/wasm
gesture model       → public/models
MIDI                → public/midi
CSS/JS              → project local
```

随后：

```bash
npm run build
```

测试 production build：

```bash
npm run preview
```

浏览器：

```text
http://localhost:4173
```

不要最后一天才第一次测试 production build。

---

# 22. 展示机固定配置

最终演示前：

```text
Windows 电源模式：插电
关闭睡眠
关闭自动锁屏
关闭系统音效/通知
浏览器固定 Chrome 或 Edge
允许 Camera permission
测试 Arduino COM 口
扬声器音量固定在合理值
禁止系统自动更新
```

USB cable 要固定，摄像头角度用胶带标记。

建议在地上用胶带标：

```text
STAND HERE
```

让参与者与摄像头保持相似距离。

---

# 23. 最终操作流程

工作人员准备：

```text
1. 插入 Arduino
2. 打开 localhost 页面
3. Start Audio
4. Start Camera
5. Connect Arduino
6. 右手戴上 wrist sensor
7. 保持静止完成 Arduino startup calibration
8. 确认状态全部 READY
9. 举左手确认 LEFT HAND TRACKED，再举右手确认不会接管视觉控制
```

参与者：

```text
1. 点击播放按钮启用声音，左手张掌放入镜头
2. 右手开始上下/前后 conducting
3. 右手连续 strokes 改变 tempo
4. 抬高左手增加 volume
5. 降低左手减小 volume
6. 左手握拳，等待连续 3 次有效识别 → pause
7. 左手张掌，等待连续 5 次有效识别 → 从暂停位置 resume
```

---

# 24. Final MVP 验收标准

项目完成的最低标准不是“代码都写了”，而是以下完整交互可以稳定展示：

```text
Right wrist MPU stroke
  → browser 收到 beat
  → BPM UI 更新
  → MIDI tempo 改变

left palm height
  → volume 连续变化

left Closed_Fist hold
  → pause

left Open_Palm hold
  → resume

beat
  → visual pulse

left palm position
  → visual trail
```

连续让不同人操作至少 10–15 分钟，不需要手动刷新页面，才能算展示级稳定。

双手隔离必须通过：右手挥拍或握拳不能触发视觉音量/暂停；左手丢失时不能由右手接管；左手恢复后不能沿用丢失前的未完成手势计数。

---

# 25. 故障与 fallback

## 25.1 Arduino 连不上

依次检查：

```text
USB 数据线是否真的是 data cable
Arduino IDE 是否占用了 COM port
浏览器是否已经授权
baud rate 是否都是 115200
刷新页面后重新 Connect Arduino
```

Arduino IDE Serial Monitor 和网页不能同时占用同一个 serial port。

## 25.2 `navigator.serial` 不存在

检查：

```text
是否 Chrome / Edge
是否 localhost / HTTPS
是否用了 file://
```

MDN：

https://developer.mozilla.org/en-US/docs/Web/API/Web_Serial_API

## 25.3 MIDI 有声音但 tempo 不跟 BPM

优先检查：

```text
是否把 note.time（seconds）当成 Transport timing
```

本项目应使用：

```text
note.ticks
note.durationTicks
midi.header.ppq
```

## 25.4 MIDI 没声音

检查：

```text
Tone.start() 是否在用户点击后调用
transport.start() 是否执行
Synth 是否 connect 到 destination
MIDI 是否成功加载
是否把所有 tracks 都过滤掉了
```

## 25.5 Gesture Recognizer 很卡

先降低：

```text
camera resolution
```

例如：

```text
640 × 480
```

保持双手检测上限：

```text
numHands = 2
```

两只手可能同时进入画面，需要检测后筛选左手。不要为了性能直接改回 `numHands = 1`，否则检测到右手时可能漏掉控制用的左手。模型输出的右手结果始终忽略。

如果还卡，可以不每个 `requestAnimationFrame` 都推理，限制在约 20–30 FPS。

## 25.6 左手 tracking 偶尔丢失

不要立即 pause。

只显示：

```text
LEFT HAND LOST
```

并 hold 上一次 volume，重置左手手势确认计数。仅检测到右手也按左手丢失处理，不自动换手。

## 25.7 Three.js 导致性能问题

直接退回 Canvas 2D。

Three.js 从来不是核心 requirement。

---

# 26. 开发优先级冻结

### P0：必须完成

```text
MPU6050 → Arduino
stroke detection
Web Serial
robust BPM
MIDI playback
dynamic tempo
Webcam
left-hand selection / right-hand exclusion
left palm height → volume
left fist/open → pause/resume
basic UI
```

### P1：非常值得做

```text
beat pulse
left palm trail
intensity → pulse strength
状态指示
本地离线部署
```

### P2：有时间再做

```text
better instrument samples
intensity → musical accent
more sophisticated Three.js scene
left-hand height-range calibration UI
serial re-calibration command
```

### 不建议投入时间

```text
Unity rewrite
traditional VST hosting
phase vocoder
audio-loop time stretching
full 3D wrist orientation reconstruction
cross-browser support
```

---

# 27. 推荐开发时间线

### Day 1：硬件

```text
MPU6050 接线
Adafruit library
raw data
Serial Plotter
stroke detector
BEAT protocol
```

结束时必须达到：

```text
Arduino 独立可靠输出 BEAT
```

### Day 2：MIDI / Browser

```text
Vite
Tone.js
@tonejs/midi
ode.mid
manual BPM slider
Web Serial
Arduino → BPM
```

结束时必须达到：

```text
挥拍已经可以改变音乐 tempo
```

这是项目最核心 milestone。

### Day 3：CV

```text
MediaPipe Gesture Recognizer
camera
left-hand selection / handedness verification
left palm Y
volume
left fist/open
debounce
both-hands isolation / left-hand loss tests
```

结束时：

```text
所有核心 input → mapping → output 已闭环
```

### Day 4：Visual + Integration

```text
Canvas trail
beat pulse
status panel
UI
error handling
```

### Day 5：展示稳定性

只做：

```text
调 threshold
调 smoothing
固定 cable
离线化
production build
多用户测试
```

不要在最后一天重写架构。

---

# 28. 最终对教授反馈的落实

教授提出的核心问题是：

```text
MIDI 本身不是 audio，
因此需要 synthesizer/VST。
```

最终实现采用：

```text
MIDI file
  ↓
@tonejs/midi
  ↓
Tone.js Transport
  ↓
Tone.PolySynth / later optional Sampler
  ↓
browser audio output
```

这正好避开 audio-loop 的问题：

```text
改变 tempo
≠
改变 pitch
```

因此本项目最终不需要 vocoder。

并且整个系统仍然保持清晰分工：

```text
Arduino = physical rhythm controller
Webcam  = spatial/gesture controller
Browser = musical engine + visuals
```

---

# 29. 核心参考链接总表

**Arduino / MPU6050**

https://github.com/adafruit/Adafruit_MPU6050

**Tone.js**

https://tonejs.github.io/

https://tonejs.github.io/docs/

https://github.com/Tonejs/Tone.js

**@tonejs/midi**

https://github.com/Tonejs/Midi

**MediaPipe Gesture Recognizer**

https://developers.google.com/edge/mediapipe/solutions/vision/gesture_recognizer

https://developers.google.com/edge/mediapipe/solutions/vision/gesture_recognizer/web_js

**MediaPipe Gesture Recognizer Model**

https://storage.googleapis.com/mediapipe-tasks/gesture_recognizer/gesture_recognizer.task

**Web Serial**

https://developer.mozilla.org/en-US/docs/Web/API/Web_Serial_API

**Vite**

https://vite.dev/

**Mutopia — Ode to Joy**

https://www.mutopiaproject.org/cgibin/piece-info.cgi?id=528

https://www.mutopiaproject.org/ftp/BeethovenLv/ode/ode.mid

**Mutopia — Für Elise**

https://www.mutopiaproject.org/cgibin/piece-info.cgi?id=931

https://www.mutopiaproject.org/ftp/BeethovenLv/WoO59/fur_Elise_WoO59/fur_Elise_WoO59.mid

**MuseScore**

https://musescore.org/

---

# 30. 一句话版本

最终要实现的不是“一个网页控制播放器”，而是：

```text
Right wrist Arduino IMU
      ↓
physical conducting beats
      ↓
robust tempo estimation
      ↓
MIDI musical timeline
      ↓
real-time synthesized music

       +

webcam LEFT palm height / gesture
      ↓
volume / pause / resume

       +

synchronized visual feedback
```

先把 **Arduino → MIDI tempo** 做成稳定闭环，再接入 Webcam，最后才做视觉美化。这个顺序能最大限度降低 final project 集成风险。
