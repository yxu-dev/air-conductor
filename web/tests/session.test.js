import test from 'node:test';
import assert from 'node:assert/strict';
import { ConductorSession } from '../src/session.js';
import { FakePort, FakeSerial, until } from './fake-serial.js';

function setup({ calibrationFails = false } = {}) {
  let now = 0;
  const port = new FakePort((command, port) => {
    if (command === 'STATUS') port.feed('STATUS,UNCALIBRATED\n');
    else if (command === 'CALIBRATE') {
      port.feed('DETECT,OFF\nSTATUS,CALIBRATING\n');
      port.feed(calibrationFails ? 'ERROR,CALIBRATION_NOT_STILL\nSTATUS,UNCALIBRATED\n' : 'CALIBRATION,0,0,-9.8,0,0,0,0.01,0.001\nREADY\n');
    } else port.feed(command + '\n');
  });
  const session = new ConductorSession({ serial: new FakeSerial(port), clock: () => now, startupMs: 0, preparationMs: 0 });
  return { session, port, setTime: value => { now = value; } };
}

test('handshake stops old output, calibration gates detection, and beats reach BPM', async () => {
  const { session, port, setTime } = setup();
  await session.connect();
  await until(() => session.state.serialPhase === 'connected');
  assert.deepEqual(port.commands.slice(0, 3), ['DETECT,OFF', 'STREAM,OFF', 'STATUS']);
  await assert.rejects(session.setDetection(true), /calibration/);
  await session.calibrate();
  assert.equal(session.state.calibrationState, 'ready');
  assert.equal(session.state.detectionActive, false);
  await session.setDetection(true);
  for (let i = 0; i < 12; ++i) {
    setTime(i * 500); port.feed(`BEAT,${i * 500},0.5\n`);
    await until(() => session.state.receivedBeatCount === i + 1);
  }
  assert.equal(session.state.measuredBpm, 120);
  assert.ok(session.exportCsv().includes('BEAT,5500,0.5'));
  await session.disconnect();
  assert.equal(session.state.measuredBpm, null);
});

test('failed calibration stays disabled and can retry', async () => {
  const { session } = setup({ calibrationFails: true });
  await session.connect();
  await until(() => session.state.serialPhase === 'connected');
  await assert.rejects(session.calibrate(), /Movement/);
  assert.equal(session.state.calibrationState, 'uncalibrated');
  assert.equal(session.state.detectionActive, false);
  assert.equal(session.state.actionPending, false);
  await session.disconnect();
});

test('motion capability, wrap, old firmware and detection epochs gate motion callbacks', async () => {
  const { session, port } = setup();
  const events = [];
  session.onMotion = message => events.push(message.value);
  await session.connect(); await until(() => session.state.serialPhase === 'connected');
  await session.calibrate(); await session.setDetection(true);
  port.feed('MOTION,1,MOVING,4294967200\n');
  await new Promise(resolve => setTimeout(resolve, 5));
  assert.deepEqual(events, []);
  port.feed('CAPS,MOTION,1\nMOTION,1,MOVING,4294967200\nMOTION,1,STILL,20\n');
  await until(() => events.length === 2);
  port.feed('MOTION,1,MOVING,19\nMOTION,1,MOVING,20\nMOTION,1,STILL,21\n');
  await new Promise(resolve => setTimeout(resolve, 5));
  assert.deepEqual(events, ['MOVING', 'STILL']);
  await session.setDetection(false);
  assert.equal(session.state.motionState, 'unknown');
  port.feed('MOTION,1,MOVING,30\n');
  await new Promise(resolve => setTimeout(resolve, 5));
  assert.equal(events.length, 2);
  await session.disconnect();
  assert.equal(session.state.motionSupported, false);
  assert.equal(session.state.coronaArmed, false);
});

test('recalibration and BOOT clear tempo; stale beats outside active detection are ignored', async () => {
  const { session, port, setTime } = setup();
  await session.connect();
  await until(() => session.state.serialPhase === 'connected');
  port.feed('BEAT,100,0.5\n');
  await new Promise(resolve => setTimeout(resolve, 5));
  assert.equal(session.state.receivedBeatCount, 0);
  await session.calibrate(); await session.setDetection(true);
  for (let i = 0; i < 5; ++i) { setTime(i * 1000); port.feed(`BEAT,${i * 1000},0.5\n`); await until(() => session.state.receivedBeatCount === i + 1); }
  assert.equal(session.state.measuredBpm, 60);
  await session.calibrate();
  assert.equal(session.state.measuredBpm, null);
  assert.equal(session.state.detectionActive, false);
  port.feed('BOOT,1\n');
  await until(() => session.state.calibrationState === 'uncalibrated');
  assert.equal(session.state.detectionActive, false);
  await session.disconnect();
});
