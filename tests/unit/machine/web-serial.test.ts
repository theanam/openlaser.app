import { afterEach, describe, expect, it, vi } from 'vitest';
import { COMMON_USB_SERIAL_FILTERS, describePort } from '$lib/machine/transport/usb-filters';
import { WebSerialTransport, isWebSerialSupported } from '$lib/machine/transport/web-serial';
import type { Serial, SerialOptions, SerialPort } from '$lib/machine/transport/web-serial-types';

/** An in-memory SerialPort built on real web streams. */
class FakePort extends EventTarget implements SerialPort {
  readable: ReadableStream<Uint8Array> | null = null;
  writable: WritableStream<Uint8Array> | null = null;
  openedWith: SerialOptions | null = null;
  closeCalls = 0;
  written: Uint8Array[] = [];
  concurrentWrites = 0;
  maxConcurrentWrites = 0;
  private controller: ReadableStreamDefaultController<Uint8Array> | null = null;

  constructor(private readonly info = { usbVendorId: 0x1a86, usbProductId: 0x7523 }) {
    super();
  }

  async open(options: SerialOptions): Promise<void> {
    this.openedWith = options;
    this.readable = new ReadableStream<Uint8Array>({ start: (c) => void (this.controller = c) });
    this.writable = new WritableStream<Uint8Array>({
      write: async (chunk) => {
        this.concurrentWrites++;
        this.maxConcurrentWrites = Math.max(this.maxConcurrentWrites, this.concurrentWrites);
        await new Promise((r) => setTimeout(r, 1));
        this.written.push(chunk);
        this.concurrentWrites--;
      },
    });
  }

  async close(): Promise<void> {
    this.closeCalls++;
    this.readable = null;
    this.writable = null;
  }

  getInfo() {
    return this.info;
  }

  emit(text: string) {
    this.controller?.enqueue(Uint8Array.from(text, (c) => c.charCodeAt(0)));
  }

  fail(error: Error) {
    this.controller?.error(error);
  }
}

class FakeSerial extends EventTarget implements Serial {
  requested: unknown[] = [];
  constructor(readonly ports: FakePort[]) {
    super();
  }
  async requestPort(options?: unknown): Promise<SerialPort> {
    this.requested.push(options);
    return this.ports[0];
  }
  async getPorts(): Promise<SerialPort[]> {
    return this.ports;
  }
  unplug(port: FakePort) {
    const event = new Event('disconnect');
    Object.defineProperty(event, 'target', { value: port });
    this.dispatchEvent(event);
  }
}

const decode = (chunks: Uint8Array[]) => chunks.map((c) => String.fromCharCode(...c)).join('');
const tick = () => new Promise((r) => setTimeout(r, 5));

describe('WebSerialTransport', () => {
  afterEach(() => vi.unstubAllGlobals());

  it('detects Web Serial support', () => {
    vi.stubGlobal('navigator', {});
    expect(isWebSerialSupported()).toBe(false);
    vi.stubGlobal('navigator', { serial: new FakeSerial([]) });
    expect(isWebSerialSupported()).toBe(true);
  });

  it('requests a port, optionally filtered to common USB-serial chips', async () => {
    const serial = new FakeSerial([new FakePort()]);
    const transport = await WebSerialTransport.request({ serial });
    await WebSerialTransport.request({ serial, commonChipsOnly: true });
    expect(serial.requested).toEqual([{}, { filters: [...COMMON_USB_SERIAL_FILTERS] }]);
    expect(transport.label).toBe('USB 1a86:7523 (WCH CH340/CH341/CH9102)');
    expect(describePort({})).toBe('Serial port');
  });

  it('lists previously granted ports for reconnect', async () => {
    const serial = new FakeSerial([
      new FakePort(),
      new FakePort({ usbVendorId: 0x10c4, usbProductId: 0xea60 }),
    ]);
    const granted = await WebSerialTransport.grantedPorts(serial);
    expect(granted.map((t) => t.label)).toEqual([
      'USB 1a86:7523 (WCH CH340/CH341/CH9102)',
      'USB 10c4:ea60 (Silicon Labs CP210x)',
    ]);
    expect(await WebSerialTransport.grantedPorts(undefined)).toEqual([]);
  });

  it('opens 8N1 without flow control, reads continuously and serializes writes', async () => {
    const port = new FakePort();
    const transport = new WebSerialTransport(port, new FakeSerial([port]));
    const received: string[] = [];
    transport.onData((chunk) => received.push(String.fromCharCode(...chunk)));
    await transport.open({ baudRate: 115200 });
    expect(port.openedWith).toEqual({
      baudRate: 115200,
      dataBits: 8,
      stopBits: 1,
      parity: 'none',
      flowControl: 'none',
    });
    expect(transport.connected).toBe(true);
    port.emit('Grbl 1.1h ');
    port.emit("['$' for help]\r\n");
    await tick();
    expect(received.join('')).toBe("Grbl 1.1h ['$' for help]\r\n");
    await Promise.all(
      ['$I\n', '$$\n', '?', 'G0 X1\n'].map((s) =>
        transport.write(Uint8Array.from(s, (c) => c.charCodeAt(0))),
      ),
    );
    expect(decode(port.written)).toBe('$I\n$$\n?G0 X1\n');
    expect(port.maxConcurrentWrites).toBe(1);
  });

  it('closes safely twice and rejects writes afterwards', async () => {
    const port = new FakePort();
    const transport = new WebSerialTransport(port, new FakeSerial([port]));
    await transport.open({ baudRate: 115200 });
    await Promise.all([transport.close(), transport.close()]);
    await transport.close();
    expect(port.closeCalls).toBe(1);
    expect(transport.connected).toBe(false);
    await expect(transport.write(Uint8Array.of(1))).rejects.toThrow(/closed/);
  });

  it('reports the disconnect event for its port as a disconnect', async () => {
    const port = new FakePort();
    const serial = new FakeSerial([port]);
    const transport = new WebSerialTransport(port, serial);
    const reasons: string[] = [];
    transport.onDisconnect((r) => reasons.push(r));
    await transport.open({ baudRate: 115200 });
    serial.unplug(new FakePort());
    expect(reasons).toEqual([]);
    serial.unplug(port);
    expect(reasons).toEqual(['USB device disconnected']);
    await tick();
    expect(port.closeCalls).toBe(1);
  });

  it('reports reader errors as a disconnect', async () => {
    const port = new FakePort();
    const transport = new WebSerialTransport(port, new FakeSerial([port]));
    const reasons: string[] = [];
    transport.onDisconnect((r) => reasons.push(r));
    await transport.open({ baudRate: 115200 });
    port.fail(new Error('BufferOverrunError'));
    await tick();
    expect(reasons).toEqual(['Read error: BufferOverrunError']);
    expect(transport.connected).toBe(false);
  });
});
