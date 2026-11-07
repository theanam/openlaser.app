import { Listeners } from '../store';
import type { Transport, Unsubscribe } from '../types';
import { COMMON_USB_SERIAL_FILTERS, describePort } from './usb-filters';
import type { NavigatorWithSerial, Serial, SerialPort } from './web-serial-types';

function navigatorSerial(): Serial | undefined {
  if (typeof navigator === 'undefined') return undefined;
  return (navigator as Navigator & NavigatorWithSerial).serial;
}

/** Chrome and Edge on desktop; not Firefox or Safari. */
export function isWebSerialSupported(): boolean {
  return navigatorSerial() !== undefined;
}

function requireSerial(serial: Serial | undefined): Serial {
  if (!serial)
    throw new Error('Web Serial is not supported in this browser. Use Chrome or Edge on a desktop computer.');
  return serial;
}

type PortState = 'closed' | 'open' | 'closing';

/**
 * Web Serial transport (SPEC §7.1): 8N1 without flow control, one persistent reader loop and a
 * serialized write queue. Reader errors and the `disconnect` event are reported as disconnects.
 */
export class WebSerialTransport implements Transport {
  readonly kind = 'webserial' as const;
  readonly label: string;
  private state: PortState = 'closed';
  private reader: ReadableStreamDefaultReader<Uint8Array> | null = null;
  private writer: WritableStreamDefaultWriter<Uint8Array> | null = null;
  private readLoop: Promise<void> | null = null;
  private writeChain: Promise<void> = Promise.resolve();
  private closing: Promise<void> | null = null;
  private readonly dataListeners = new Listeners<Uint8Array>();
  private readonly disconnectListeners = new Listeners<string>();

  /** Shows the browser's port picker. Must be called from a user gesture (click). */
  static async request(
    options: { commonChipsOnly?: boolean; serial?: Serial } = {},
  ): Promise<WebSerialTransport> {
    const serial = requireSerial(options.serial ?? navigatorSerial());
    const filters = options.commonChipsOnly ? [...COMMON_USB_SERIAL_FILTERS] : undefined;
    const port = await serial.requestPort(filters ? { filters } : {});
    return new WebSerialTransport(port, serial);
  }

  /** Ports the user granted earlier, for one-click reconnect without the picker. */
  static async grantedPorts(serial: Serial | undefined = navigatorSerial()): Promise<WebSerialTransport[]> {
    if (!serial) return [];
    const ports = await serial.getPorts();
    return ports.map((port) => new WebSerialTransport(port, serial));
  }

  constructor(
    readonly port: SerialPort,
    private readonly serial: Serial | null = navigatorSerial() ?? null,
  ) {
    this.label = describePort(port.getInfo());
  }

  get connected(): boolean {
    return this.state === 'open';
  }

  async open(options: { baudRate: number }): Promise<void> {
    if (this.state !== 'closed') throw new Error('Port is already open');
    await this.port.open({
      baudRate: options.baudRate,
      dataBits: 8,
      stopBits: 1,
      parity: 'none',
      flowControl: 'none',
    });
    const { readable, writable } = this.port;
    if (!readable || !writable) {
      await this.port.close().catch(() => undefined);
      throw new Error('Serial port opened without readable/writable streams');
    }
    this.reader = readable.getReader();
    this.writer = writable.getWriter();
    this.writeChain = Promise.resolve();
    this.closing = null;
    this.state = 'open';
    this.serial?.addEventListener('disconnect', this.handleDisconnectEvent);
    this.readLoop = this.runReadLoop(this.reader);
  }

  write(data: Uint8Array): Promise<void> {
    if (this.state !== 'open') return Promise.reject(new Error('Port is closed'));
    // Chain writes so there is never more than one writer.write in flight.
    const run = this.writeChain.then(() => {
      if (this.state !== 'open' || !this.writer) throw new Error('Port is closed');
      return this.writer.write(data);
    });
    this.writeChain = run.catch(() => undefined);
    return run;
  }

  /** Cancels the reader, releases the stream locks and closes the port. Safe to call twice. */
  close(): Promise<void> {
    if (this.closing) return this.closing;
    if (this.state === 'closed') return Promise.resolve();
    this.state = 'closing';
    this.closing = this.shutdown();
    return this.closing;
  }

  onData(cb: (chunk: Uint8Array) => void): Unsubscribe {
    return this.dataListeners.add(cb);
  }

  onDisconnect(cb: (reason: string) => void): Unsubscribe {
    return this.disconnectListeners.add(cb);
  }

  private async shutdown(): Promise<void> {
    this.serial?.removeEventListener('disconnect', this.handleDisconnectEvent);
    const reader = this.reader;
    const writer = this.writer;
    this.reader = null;
    this.writer = null;
    await reader?.cancel().catch(() => undefined);
    await this.readLoop?.catch(() => undefined);
    try {
      reader?.releaseLock();
    } catch {
      // Already released by the browser when the device vanished.
    }
    try {
      // Pending writes reject; a dead device must not block closing.
      writer?.releaseLock();
    } catch {
      // Same as above.
    }
    await this.port.close().catch(() => undefined);
    this.state = 'closed';
  }

  private async runReadLoop(reader: ReadableStreamDefaultReader<Uint8Array>): Promise<void> {
    try {
      for (;;) {
        const { value, done } = await reader.read();
        if (done) break;
        if (value && value.length > 0) this.dataListeners.emit(value);
      }
    } catch (error) {
      this.lose(`Read error: ${error instanceof Error ? error.message : String(error)}`);
      return;
    }
    this.lose('The serial port was closed');
  }

  private readonly handleDisconnectEvent = (event: Event): void => {
    if (event.target === this.port) this.lose('USB device disconnected');
  };

  private lose(reason: string): void {
    if (this.state !== 'open') return;
    void this.close();
    this.disconnectListeners.emit(reason);
  }
}
