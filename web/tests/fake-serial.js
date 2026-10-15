export class FakePort {
  constructor(handler = () => {}) { this.handler = handler; this.commands = []; this.closed = false; }
  async open(options) {
    this.options = options;
    this.closed = false;
    this.readable = new ReadableStream({ start: controller => { this.input = controller; } });
    this.writable = new WritableStream({ write: bytes => {
      const text = new TextDecoder().decode(bytes);
      for (const command of text.trim().split('\n')) { this.commands.push(command); this.handler(command, this); }
    } });
  }
  feed(text) { this.input.enqueue(new TextEncoder().encode(text)); }
  async close() {
    if (this.readable.locked || this.writable.locked) throw new Error('Streams still locked');
    this.closed = true;
  }
}

export class FakeSerial extends EventTarget {
  constructor(port) { super(); this.port = port; }
  async requestPort() { return this.port; }
  unplug() { const event = new Event('disconnect'); Object.defineProperty(event, 'port', { value: this.port }); this.dispatchEvent(event); }
}

export async function until(predicate, timeout = 1000) {
  const started = Date.now();
  while (!predicate()) {
    if (Date.now() - started > timeout) throw new Error('Condition timeout');
    await new Promise(resolve => setTimeout(resolve, 2));
  }
}
