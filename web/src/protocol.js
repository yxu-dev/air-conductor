const numberPattern = /^-?(?:\d+(?:\.\d*)?|\.\d+)(?:[eE][+-]?\d+)?$/;
const states = new Set(['UNCALIBRATED', 'CALIBRATING', 'READY', 'SENSOR_ERROR']);
function numeric(value) {
  return numberPattern.test(value) && Number.isFinite(Number(value));
}
function timestamp(value) {
  return /^\d{1,10}$/.test(value) && Number(value) < 2 ** 32;
}

export function parseSerialLine(line) {
  const parts = line.split(',');
  const [type, value] = parts;
  if (type === 'CAPS' && parts.length === 3 && value === 'MOTION' && parts[2] === '1') return { type, motionVersion: 1 };
  if (type === 'MOTION' && parts.length === 4 && value === '1' && ['STILL', 'MOVING'].includes(parts[2]) && timestamp(parts[3])) {
    return { type, version: 1, value: parts[2], timestampMs: Number(parts[3]) };
  }
  if (type === 'BEAT' && parts.length === 3 && timestamp(value) && numeric(parts[2])) {
    const intensity = Number(parts[2]);
    return intensity >= 0 && intensity <= 1 ? { type, timestampMs: Number(value), intensity } : null;
  }
  if (type === 'IMU' && parts.length === 8 && timestamp(value) && parts.slice(2).every(numeric)) {
    return { type, timestampMs: Number(value), values: parts.slice(2).map(Number) };
  }
  if (type === 'CALIBRATION' && parts.length === 9 && parts.slice(1).every(numeric) &&
      Number(parts[7]) >= 0 && Number(parts[8]) >= 0) {
    return { type, values: parts.slice(1, 7).map(Number), accelStd: Number(parts[7]), gyroStd: Number(parts[8]) };
  }
  if (type === 'BOOT' && parts.length === 2 && value === '1') return { type, version: 1 };
  if (type === 'READY' && parts.length === 1) return { type };
  if (type === 'STATUS' && parts.length === 2 && states.has(value)) return { type, value };
  if ((type === 'DETECT' || type === 'STREAM') && parts.length === 2 && ['ON', 'OFF'].includes(value)) {
    return { type, enabled: value === 'ON' };
  }
  if (type === 'ERROR' && parts.length === 2 && /^[A-Z_]+$/.test(value)) return { type, code: value };
  if (type === 'INFO' && parts.length === 4 && value === 'IMU' &&
      ['MPU6050', 'MPU6500'].includes(parts[2]) && ['104', '105'].includes(parts[3])) {
    return { type, model: parts[2], address: Number(parts[3]) };
  }
  return null;
}

export class LineFramer {
  constructor(limit = 512) { this.limit = limit; this.buffer = ''; this.discarding = false; }
  feed(bytes) {
    const lines = [];
    let invalid = 0;
    for (const byte of bytes) {
      if (byte === 10) {
        const line = this.buffer.replace(/\r$/, '');
        if (!this.discarding && line) lines.push(line);
        this.buffer = '';
        this.discarding = false;
      } else if (!this.discarding) {
        if ((byte < 32 && byte !== 13) || byte > 126 || this.buffer.length >= this.limit) {
          this.discarding = true;
          this.buffer = '';
          invalid += 1;
        } else this.buffer += String.fromCharCode(byte);
      }
    }
    return { lines, invalid };
  }
}
