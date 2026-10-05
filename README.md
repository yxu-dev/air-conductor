# Air Conductor

Arduino Uno + MPU6050 可穿戴音乐控制器。Arduino 提供挥拍事件，浏览器负责 MIDI 音乐、摄像头手势与视觉反馈。

## 当前状态

当前为项目骨架：浏览器页面可启动和构建；传感器采样、挥拍识别、串口连接、音乐播放和摄像头识别尚未实现。Arduino sketch 只报告 `STATUS,SCAFFOLD`，不是可演示固件。

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

更新 `@mediapipe/tasks-vision` 后运行 `npm run sync:wasm`，再构建；脚本会自动清理旧版本的 WASM 文件。

## Python 环境

沿用现有 `infosci201-physical` Conda 环境，无需重新创建或更新：

```powershell
conda activate infosci201-physical
```

`environment.yml` 仅记录 Final 诊断工具需要的依赖，供新电脑重建环境。两个诊断脚本目前只提供参数入口，尚未连接硬件或分析数据；可用 `python diagnostics/read_serial.py --help` 查看规划的参数。

最终浏览器展示不需要启动 Python。浏览器、Python 和 Arduino Serial Monitor 不应同时占用同一串口。

## Arduino

正式入口：`arduino/AirConductor/AirConductor.ino`。板型为 Arduino Uno（`arduino:avr:uno`）。使用工作区规定的 bundled Arduino CLI 编译和上传；上传前确认 sketch 和实际串口，当前记录为 COM3。本阶段不上传固件。

当前开发机已安装 Adafruit MPU6050 Arduino Library，MPU6050 已接到 Uno，当前串口为 COM3；原始读数尚待下一阶段验证。接线为 SDA→A4、SCL→A5、GND→GND，供电和 I2C 电平按实际 breakout board 确认。下一阶段将接入已安装的库，实现采样与校准。

## 开发顺序

1. MPU6050 采样、静止校准和单次挥拍检测。
2. 串口事件、误触发过滤和 BPM 估计。
3. MIDI 播放、手动变速及 Arduino 接管节奏。
4. 摄像头手势、音量、暂停与恢复。
5. 视觉反馈、重连、离线与多人验收。

详见 [架构](docs/architecture.md)、[串口协议草案](docs/serial-protocol.md)、[验收计划](docs/testing.md)和[资源来源](docs/assets.md)。
