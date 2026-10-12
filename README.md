# Air Conductor

Make music with motion. A right-wrist IMU sets the tempo; webcam tracking of your left hand controls volume and playback. A glass studio with Three.js visuals guides setup and offers fullscreen playback or a device-free Listen mode.

## Run

**Before starting the frontend, use Arduino IDE to upload [`arduino/AirConductor/AirConductor.ino`](arduino/AirConductor/AirConductor.ino) to your Arduino Uno.** Then start the frontend with the commands below.

Requires Node.js 20.19+ (20.x) or 22.12+ and npm. From the repository root:

```powershell
cd web
npm ci
npm run build
npm run preview -- --host 127.0.0.1 --port 5173 --strictPort
```

Open **http://127.0.0.1:5173/** in Chrome or Edge. Music, hand models and tracking assets are served locally. Keep the terminal running while using the app.

## Play

The setup window opens when you arrive. Choose **Listen** for music with sliders, or **Conduct** and complete these steps:

1. Wear the right-wrist sensor in the verified orientation. Connect the Arduino by USB and select it with **Connect**.
2. Click **Calibrate**. Rest your right hand through the countdown and sampling period.
3. Enable the camera. Show only your left hand, then **Confirm** when tracking is stable.
4. Choose **Enter studio**, then **Play**. Right-hand downward strokes control tempo; lift to reset. Raise your left hand for louder music and lower it for softer music.
5. Hold a fist to pause; open your palm to resume. Buttons also control playback.

Pause preserves position; the square End button stops detection and rewinds. Idle strokes retain tempo. Losing the left hand holds volume; restarting the camera requires confirmation again. **Devices** reopens setup; **Reset devices** ends playback and releases both connections. **Settings** contains source overrides, gesture controls, CSV export and optional diagnostics. Closing a window keeps your session running. Opening the page never requests device access or starts sound automatically.

**Visual atmosphere** offers Glacier and Iris palettes and reduced motion. System motion preferences are respected. The scene pauses behind open windows and loads separately; if WebGL is unavailable, a static view keeps music and hand controls available.

## Hardware

The firmware uses Adafruit MPU6050, Unified Sensor, and BusIO libraries. I2C uses SDA/A4, SCL/A5, and GND; supply power appropriate to your breakout. Close Arduino IDE's Serial Monitor before connecting from the browser.

MPU6050 and MPU6500 are supported. The firmware expects downward right-wrist strokes to produce negative `gx`; changing the sensor mounting requires checking that direction.

## License and credits

Project code: MIT. MediaPipe's hand model and runtime use Apache-2.0; Three.js, Tailwind CSS, Tone.js and @tonejs/midi use MIT. The included MIDI plays Beethoven’s *Ode to Joy*. The locally bundled Inter font uses SIL OFL-1.1. Third-party assets retain their upstream licenses.

<details>
<summary>MIT License</summary>

Copyright (c) 2026 Yifan Xu

Permission is hereby granted, free of charge, to any person obtaining a copy
of this software and associated documentation files (the "Software"), to deal
in the Software without restriction, including without limitation the rights
to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
copies of the Software, and to permit persons to whom the Software is
furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in all
copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
SOFTWARE.

</details>

<details>
<summary>Inter font: SIL Open Font License 1.1</summary>

```text
Copyright 2016 The Inter Project Authors (https://github.com/rsms/inter) Inter-Italic[opsz,wght].ttf: Copyright 2016 The Inter Project Authors (https://github.com/rsms/inter)

This Font Software is licensed under the SIL Open Font License, Version 1.1.
This license is copied below, and is also available with a FAQ at:
http://scripts.sil.org/OFL


-----------------------------------------------------------
SIL OPEN FONT LICENSE Version 1.1 - 26 February 2007
-----------------------------------------------------------

PREAMBLE
The goals of the Open Font License (OFL) are to stimulate worldwide
development of collaborative font projects, to support the font creation
efforts of academic and linguistic communities, and to provide a free and
open framework in which fonts may be shared and improved in partnership
with others.

The OFL allows the licensed fonts to be used, studied, modified and
redistributed freely as long as they are not sold by themselves. The
fonts, including any derivative works, can be bundled, embedded,
redistributed and/or sold with any software provided that any reserved
names are not used by derivative works. The fonts and derivatives,
however, cannot be released under any other type of license. The
requirement for fonts to remain under this license does not apply
to any document created using the fonts or their derivatives.

DEFINITIONS
"Font Software" refers to the set of files released by the Copyright
Holder(s) under this license and clearly marked as such. This may
include source files, build scripts and documentation.

"Reserved Font Name" refers to any names specified as such after the
copyright statement(s).

"Original Version" refers to the collection of Font Software components as
distributed by the Copyright Holder(s).

"Modified Version" refers to any derivative made by adding to, deleting,
or substituting -- in part or in whole -- any of the components of the
Original Version, by changing formats or by porting the Font Software to a
new environment.

"Author" refers to any designer, engineer, programmer, technical
writer or other person who contributed to the Font Software.

PERMISSION & CONDITIONS
Permission is hereby granted, free of charge, to any person obtaining
a copy of the Font Software, to use, study, copy, merge, embed, modify,
redistribute, and sell modified and unmodified copies of the Font
Software, subject to the following conditions:

1) Neither the Font Software nor any of its individual components,
in Original or Modified Versions, may be sold by itself.

2) Original or Modified Versions of the Font Software may be bundled,
redistributed and/or sold with any software, provided that each copy
contains the above copyright notice and this license. These can be
included either as stand-alone text files, human-readable headers or
in the appropriate machine-readable metadata fields within text or
binary files as long as those fields can be easily viewed by the user.

3) No Modified Version of the Font Software may use the Reserved Font
Name(s) unless explicit written permission is granted by the corresponding
Copyright Holder. This restriction only applies to the primary font name as
presented to the users.

4) The name(s) of the Copyright Holder(s) or the Author(s) of the Font
Software shall not be used to promote, endorse or advertise any
Modified Version, except to acknowledge the contribution(s) of the
Copyright Holder(s) and the Author(s) or with their explicit written
permission.

5) The Font Software, modified or unmodified, in part or in whole,
must be distributed entirely under this license, and must not be
distributed under any other license. The requirement for fonts to
remain under this license does not apply to any document created
using the Font Software.

TERMINATION
This license becomes null and void if any of the above conditions are
not met.

DISCLAIMER
THE FONT SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND,
EXPRESS OR IMPLIED, INCLUDING BUT NOT LIMITED TO ANY WARRANTIES OF
MERCHANTABILITY, FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT
OF COPYRIGHT, PATENT, TRADEMARK, OR OTHER RIGHT. IN NO EVENT SHALL THE
COPYRIGHT HOLDER BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER LIABILITY,
INCLUDING ANY GENERAL, SPECIAL, INDIRECT, INCIDENTAL, OR CONSEQUENTIAL
DAMAGES, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING
FROM, OUT OF THE USE OR INABILITY TO USE THE FONT SOFTWARE OR FROM
OTHER DEALINGS IN THE FONT SOFTWARE.
```

</details>
