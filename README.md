# Air Conductor

Arduino Uno + MPU6050 可穿戴音乐控制器。Arduino 提供挥拍事件，浏览器负责 MIDI 音乐、摄像头手势与视觉反馈。

## 当前状态

Stage A/B 已实现 MPU6050/MPU6500 六轴采样、显式静止校准、下挥检测和 `BEAT` 输出，以及 Python 采集与分析。Stage C 已实现浏览器串口、连接/校准/检测操作、BPM 估计与拍点反馈。Stage D 已实现本地 MIDI 循环、手动变速、暂停/恢复/停止、音量和可切换的挥拍速度控制。Stage E 已接入左手摄像头控制，实机手势测试待进行。`READY` 表示传感器校准成功，需 `DETECT,ON` 开启检测。

COM3 实机已完成五分钟连续采样和串口命令检查，见 [Stage A 桌面测试结果](docs/stage-a-bench.md)。

右手佩戴分段采集已完成。初始采集选用 `gx` 正向；当前用户确认上抬被计拍后，已改用 `gx` 负向，并独立验证下挥 3 拍、上抬 0 拍、静止 0 拍。见 [佩戴采集与分析](docs/worn-capture.md)和[挥拍检测](docs/stroke-detection.md)。

早期分离动作提示记录为下挥段 10 拍、回程段 0 拍；Stage B 的独立 60 BPM 提示复测输出 12 拍，静止/准备/停止段 0 拍。固件/诊断 17 项测试、网页 25 项测试通过。Stage C 已通过真实 Chrome 连接、校准及连续拍点接收；方向修正前的 60/90/120 BPM 提示短测分别收到 11/12/13 拍。用当前算法回放各段末值约 59.7/91.2/121.4 BPM，不能用提示次数直接推算准确率。详见 [浏览器串口与节奏测量](docs/browser-tempo.md)。

接入音乐后，网页共 34 项 Node 测试通过，生产构建通过。Chrome 实际离线音频渲染的 4 项检查通过，覆盖变速保持音高、音符结束、长音中变速、循环和小数 tick 暂停/恢复。用户确认主页面暂停后可从原位置继续，实机挥拍能改变音乐速度，但本轮变化不明显：慢段未形成范围内 BPM，快段音乐目标约 110–126 BPM。详见 [音乐播放](docs/music-playback.md)。

接入左手控制后，真实 Chrome 的本地视觉 Worker 检查 2 项通过，确认模型/WASM 可加载并处理空白图像。2026-10-10 用户确认实际左手追踪、音量数值/听感和握拳暂停正常。对齐 Lab4 后自然张掌仍不稳定，CSV 中约 0.56–0.63 的分数被 0.65 阈值拒绝。现保留握拳 0.65 / 连续 3 次，张掌调整为 0.55 / 连续 5 次；52 项 Node 测试与生产构建通过。调整后用户实测 3 次暂停、3 次恢复均成功，位置连续；该轮刷新前未导出 CSV，按用户反馈记录。双手隔离、主动丢失和摄像头重开待验证。详见 [左手摄像头控制](docs/camera-control.md)。涉及用户动作的测试先汇报，等待用户明确开始后再执行。

## 目录

```text
arduino/AirConductor/   Uno 固件与挥拍检测模块
web/                   Vite 浏览器应用及本地资源
diagnostics/           Python 串口与拍点分析工具
docs/                  架构、协议、验收与资源来源
recordings/            本机调试记录（不提交）
environment.yml        Python 诊断依赖说明
```

## 浏览器开发

需要 Node.js/npm。在本仓库根目录执行：

```powershell
cd web
npm ci
npm run dev
```

打开终端显示的 localhost 地址。构建检查使用 `npm run build`，本机预览使用 `npm run preview`。模型、MIDI 和 MediaPipe WASM 均位于 `web/public/`，运行时不读取 Lab4 文件或外部 CDN。

使用 Chrome 或支持 Web Serial 的浏览器打开本机页面，点击“连接设备”并选择 Uno 的实际串口（当前 COM3）。先等待“已连接”，再点击“静止校准”：页面提供 5 秒准备时间，随后约 2.5 秒采样，保持右手支撑、静止直到“校准完成”。点击“开始检测”后连续下挥，第三个正常拍点开始显示 BPM；停止挥拍约 2.5 秒后保留上次读数并提示停挥。网页测试使用 `npm test`。完整操作与限制见 [Stage C 使用说明](docs/browser-tempo.md)。

无需连接设备也能试听音乐：保持“手动速度”，点击“播放音乐”，用滑块调整 50–180 BPM。暂停保留当前位置，继续恢复；停止回到开头。连接设备、校准并开始检测后，将音乐“速度来源”改为“跟随挥拍”。音乐和设备测量分别显示 BPM；停挥或断开设备时音乐保持最后速度，暂停由音乐按钮控制。

更新 `@mediapipe/tasks-vision` 后运行 `npm run sync:wasm`，再构建；脚本会自动清理旧版本的 WASM 文件。

摄像头需手动点击“开启摄像头”。仅举左手，稳定识别后点击“确认左手”，再将“音量来源”切换到“左手高度”。左手抬高/降低调音量；握拳经连续 3 次有效识别后暂停，张掌经连续 5 次有效识别后恢复。右手视觉结果不参与控制。摄像头关闭、重开后需重新确认左手。首次声音启用仍需点击音乐播放按钮。调试记录显示左手原始手势、置信度和稳定识别次数；“复制调试信息”保存可复制的固定快照。

## Python 环境

沿用现有 `infosci201-physical` Conda 环境，无需重新创建或更新：

```powershell
conda activate infosci201-physical
```

`environment.yml` 仅记录 Final 诊断工具需要的依赖，供新电脑重建环境。`read_serial.py` 记录六轴数据、BEAT 及协议事件；`analyze_beats.py` 分析拍数、峰值时间戳、间隔和接收延迟。

在仓库根目录，将未佩戴的传感器放稳后运行：

```powershell
python diagnostics/read_serial.py --port COM3 --calibrate --require-ready --duration 20
```

脚本等待 Uno 启动，开启数据流并请求约 2.5 秒静止校准；默认保存 CSV 和同名 `.summary.json` 到 `recordings/`，报告采样率、时间戳间隔及各轴统计。加 `--output recordings/my-run.csv` 可指定新文件名，已有记录不会被覆盖。退出时停止数据流并关闭串口。

五分钟桌面采样检查使用 `--duration 305`（含启动等待），无需佩戴。佩戴后必须重新保持静止校准，再采集动作数据。

协议及数据解析检查：`python -m unittest discover -s diagnostics/tests -v`。

右手佩戴分段采集可使用 `python diagnostics/read_serial.py --port COM3 --guided`，跟随本地语音与提示音操作。分析使用 `python diagnostics/analyze_motion.py recordings/<采集文件>.csv`；加 `--plot` 可在已有 matplotlib 的环境中输出曲线。分段标记表示提示时间，不能作为已确认的逐拍真值。

完整检测器验证使用 `python diagnostics/read_serial.py --port COM3 --validate-beats`（静止、10 组分离下挥/回程、60/90/120 BPM）；随后运行 `python diagnostics/analyze_beats.py recordings/<采集文件>.csv --plot`。普通实时检测记录使用 `--detect --calibrate --duration 30`。退出时先关闭检测，再关闭原始数据流。

`python diagnostics/replay_strokes.py recordings/<采集文件>.csv` 使用同一份 C++ 检测器回放原始数据。回放和八项原生检测器测试使用本机已有 `g++`，临时编译产物位于系统临时目录；它不属于最终运行依赖。没有 `g++` 时原生测试会明确跳过，固件仍由 Arduino CLI 编译。修正后的 60 BPM 短测可用 `read_serial.py --port COM3 --check-60`。

短方向核对使用 `read_serial.py --port COM3 --direction-check`：3 组分离下挥/上抬。回放默认读取当前固件的轴与方向；历史正向记录可加 `--axis gx --direction 1`，避免将历史安装方向与当前方向混用。

最终浏览器展示不需要启动 Python。浏览器、Python 和 Arduino Serial Monitor 不应同时占用同一串口。

## Arduino

正式入口：`arduino/AirConductor/AirConductor.ino`。板型为 Arduino Uno（`arduino:avr:uno`）。使用工作区规定的 bundled Arduino CLI 编译和上传；上传前确认 sketch 和实际串口，当前记录为 COM3。固件依赖已安装的 Adafruit MPU6050、Adafruit Unified Sensor、Adafruit BusIO。

接线为 SDA→A4、SCL→A5、GND→GND，供电和 I2C 电平按实际 breakout board 确认。当前参数针对本次右手佩戴方向；调整模块方向后需重新验证检测轴和符号，再静止校准。

实机扫描发现模块地址为 `0x68`，身份寄存器为 `0x70`（MPU6500 接口）。固件已加入独立的 MPU6500 配置路径，真正 MPU6050 继续使用 Adafruit 配置路径；没有修改全局 Arduino 库。详见串口协议文档的硬件兼容说明。

## 开发顺序

1. MPU6050 采样、静止校准和单次挥拍检测。
2. 串口事件、误触发过滤和 BPM 估计。
3. MIDI 播放、手动变速及 Arduino 接管节奏。
4. 摄像头手势、音量、暂停与恢复。
5. 视觉反馈、重连、离线与多人验收。

详见 [架构](docs/architecture.md)、[串口协议草案](docs/serial-protocol.md)、[验收计划](docs/testing.md)和[资源来源](docs/assets.md)。
