import test from 'node:test';
import assert from 'node:assert/strict';
import { SerialConnection } from '../src/serial.js';
import { FakePort, FakeSerial, until } from './fake-serial.js';

test('connection receives fragmented frames and serializes writes', async () => {
  const port = new FakePort();
  const received = [];
  const connection = new SerialConnection({ serial: new FakeSerial(port), onMessage: m => received.push(m) });
  await connection.connect();
  port.feed('BEAT,10,'); port.feed('0.5\r\nREADY\n');
  await until(() => received.length === 2);
  await Promise.all([connection.send('STATUS'), connection.send('DETECT,OFF'), connection.send('STREAM,OFF')]);
  assert.deepEqual(port.commands, ['STATUS', 'DETECT,OFF', 'STREAM,OFF']);
  await connection.disconnect();
  assert.equal(port.closed, true);
  assert.deepEqual(port.commands.slice(-2), ['DETECT,OFF', 'STREAM,OFF']);
});

test('disconnect releases a reader blocked waiting for data and can reconnect', async () => {
  const port = new FakePort();
  const connection = new SerialConnection({ serial: new FakeSerial(port) });
  await connection.connect();
  await Promise.all([connection.disconnect(), connection.disconnect()]);
  assert.equal(port.readable.locked, false);
  assert.equal(port.writable.locked, false);
  await connection.connect();
  await connection.disconnect();
  assert.equal(port.closed, true);
});

test('unplug and read failure release locks without stale messages', async () => {
  const port = new FakePort();
  const serial = new FakeSerial(port);
  const received = [];
  const connection = new SerialConnection({ serial, onMessage: m => received.push(m) });
  await connection.connect();
  port.input.error(new Error('USB removed'));
  serial.unplug();
  await until(() => connection.port === null);
  assert.equal(received.length, 0);
  assert.equal(port.closed, true);
});

test('cancelling chooser is clean and arbitrary commands are refused', async () => {
  const serial = new FakeSerial(null);
  serial.requestPort = async () => { throw new DOMException('Cancelled', 'NotFoundError'); };
  const connection = new SerialConnection({ serial });
  await connection.connect();
  assert.equal(connection.port, null);
  await assert.rejects(connection.send('CALIBRATE\nDETECT,ON'));
});
