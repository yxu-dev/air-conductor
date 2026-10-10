import { config } from './config.js';
import { LineFramer, parseSerialLine } from './protocol.js';

const commands = new Set(['STATUS', 'CALIBRATE', 'DETECT,ON', 'DETECT,OFF', 'STREAM,ON', 'STREAM,OFF']);

export class SerialConnection {
  constructor({ serial = globalThis.navigator?.serial, onMessage = () => {},
    onState = () => {}, onError = () => {}, onInvalid = () => {},
    clock = () => performance.now() } = {}) {
    Object.assign(this, { serial, onMessage, onState, onError, onInvalid, clock });
    this.port = this.reader = this.writer = null;
    this.readTask = this.closeTask = null;
    this.writeTail = Promise.resolve();
    this.generation = 0;
    this.connecting = this.closing = false;
    this.disconnectListener = (event) => {
      if ((event.port ?? event.target) === this.port) {
        this.onError('The device disconnected. Reconnect and calibrate.');
        void this.disconnect({ notifyDevice: false });
      }
    };
    this.serial?.addEventListener('disconnect', this.disconnectListener);
  }

  get supported() { return Boolean(this.serial); }

  async connect() {
    if (!this.serial) throw new Error('Use Chrome or Edge with Web Serial support to connect the device.');
    if (this.port || this.connecting || this.closing) throw new Error('A device connection is already in use. Disconnect first.');
    this.connecting = true;
    const generation = ++this.generation;
    this.onState('connecting');
    let selected;
    try {
      // Invoke the chooser directly in the caller's click gesture.
      selected = await this.serial.requestPort();
      await selected.open({ baudRate: config.serialBaudRate, bufferSize: 4096 });
      if (generation !== this.generation) { await selected.close(); return; }
      this.port = selected;
      this.reader = selected.readable.getReader();
      this.writer = selected.writable.getWriter();
      this.writeTail = Promise.resolve();
      this.onState('connected');
      this.readTask = this.readLoop(generation, this.reader);
    } catch (error) {
      if (this.port) await this.disconnect({ notifyDevice: false });
      else {
        if (selected?.readable || selected?.writable) await selected.close().catch(() => {});
        this.onState('disconnected');
      }
      if (error.name !== 'NotFoundError') throw error;
    } finally { this.connecting = false; }
  }

  async readLoop(generation, reader) {
    const framer = new LineFramer();
    try {
      while (!this.closing && generation === this.generation) {
        const { value, done } = await reader.read();
        if (done) break;
        const framed = framer.feed(value);
        if (framed.invalid) this.onInvalid(framed.invalid);
        for (const line of framed.lines) {
          if (this.closing || generation !== this.generation) break;
          const message = parseSerialLine(line);
          if (message) this.onMessage(message, this.clock(), line);
          else this.onInvalid(1);
        }
      }
    } catch (error) {
      if (!this.closing && generation === this.generation) this.onError(`Device connection interrupted: ${error.message}`);
    } finally {
      reader.releaseLock();
      if (this.reader === reader) this.reader = null;
      if (!this.closing && generation === this.generation) {
        queueMicrotask(() => { void this.disconnect({ notifyDevice: false }); });
      }
    }
  }

  send(command) {
    if (!commands.has(command)) return Promise.reject(new Error('Unsupported device command.'));
    return this.enqueue(`${command}\n`);
  }

  enqueue(text, allowClosing = false) {
    if (!this.writer || (this.closing && !allowClosing)) return Promise.reject(new Error('The device is not connected.'));
    const writer = this.writer;
    const task = this.writeTail.catch(() => {}).then(() => writer.write(new TextEncoder().encode(text)));
    this.writeTail = task;
    return task;
  }

  disconnect({ notifyDevice = true } = {}) {
    if (this.closeTask) return this.closeTask;
    if (!this.port) {
      ++this.generation;
      this.onState('disconnected');
      return Promise.resolve();
    }
    this.closeTask = this.closePort(notifyDevice).finally(() => { this.closeTask = null; });
    return this.closeTask;
  }

  async closePort(notifyDevice) {
    this.closing = true;
    this.onState('disconnecting');
    const port = this.port;
    let timeout;
    try {
      const writes = notifyDevice ? this.enqueue('DETECT,OFF\nSTREAM,OFF\n', true) : this.writeTail;
      await Promise.race([writes, new Promise((_, reject) => {
        timeout = setTimeout(() => reject(new Error('Timed out while stopping the device.')), 1000);
      })]);
    } catch {
      if (this.writer) await this.writer.abort().catch(() => {});
    } finally { clearTimeout(timeout); }
    if (this.reader) await this.reader.cancel().catch(() => {});
    if (this.readTask) await this.readTask;
    if (this.writer) this.writer.releaseLock();
    await port.close().catch(() => {});
    this.port = this.reader = this.writer = this.readTask = null;
    this.writeTail = Promise.resolve();
    this.closing = false;
    ++this.generation;
    this.onState('disconnected');
  }

  async dispose() {
    await this.disconnect();
    this.serial?.removeEventListener('disconnect', this.disconnectListener);
  }
}
