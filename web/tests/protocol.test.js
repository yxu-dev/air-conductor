import test from 'node:test';
import assert from 'node:assert/strict';
import { LineFramer, parseSerialLine } from '../src/protocol.js';

test('fragmented CRLF, multiple messages and blank lines are framed correctly', () => {
  const framer = new LineFramer();
  const bytes = (value) => new TextEncoder().encode(value);
  assert.deepEqual(framer.feed(bytes('BEA')).lines, []);
  assert.deepEqual(framer.feed(bytes('T,1,0.5\r\nREADY\n\r\n')).lines, ['BEAT,1,0.5', 'READY']);
});

test('oversized and non-ASCII frames are discarded and recover at newline', () => {
  const framer = new LineFramer(20);
  assert.equal(framer.feed(new TextEncoder().encode('x'.repeat(30))).invalid, 1);
  const result = framer.feed(Uint8Array.from([10, 255, 10, ...new TextEncoder().encode('READY\n')]));
  assert.equal(result.invalid, 1);
  assert.deepEqual(result.lines, ['READY']);
});

test('BEAT field count, decimal uint32 time and normalized finite intensity', () => {
  assert.deepEqual(parseSerialLine('BEAT,4294967295,0.5'), { type: 'BEAT', timestampMs: 2 ** 32 - 1, intensity: .5 });
  for (const line of ['BEAT,-1,0.5', 'BEAT,4294967296,0.5', 'BEAT,1,NaN', 'BEAT,1,1.1',
    'BEAT,1,-0.1', 'BEAT,1,0.5,extra', 'BEAT,0x10,0.5', 'BEAT,1,0x1', 'BEAT,1.0,0.5']) assert.equal(parseSerialLine(line), null, line);
});

test('calibration/readiness/control messages are distinct', () => {
  assert.equal(parseSerialLine('STATUS,READY').value, 'READY');
  assert.equal(parseSerialLine('DETECT,ON').enabled, true);
  assert.equal(parseSerialLine('STREAM,OFF').enabled, false);
  assert.equal(parseSerialLine('INFO,IMU,MPU6500,104').model, 'MPU6500');
  assert.equal(parseSerialLine('CALIBRATION,0,0,-9.8,0,0,0,0.01,0.001').values.length, 6);
  assert.equal(parseSerialLine('IMU,10,0,0,-9.8,0,0,0').values.length, 6);
  for (const line of ['STATUS,UNKNOWN', 'READY,1', 'BOOT,99', 'CALIBRATION,0,0,0,0,0,0,-1,0', 'IMU,1,0,0,nan,0,0,0']) assert.equal(parseSerialLine(line), null);
});
