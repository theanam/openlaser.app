/**
 * Minimal Web Serial API types (https://wicg.github.io/serial/). TypeScript's DOM lib does not
 * ship them; we declare only what WebSerialTransport uses instead of augmenting globals.
 */
export interface SerialPortInfo {
  usbVendorId?: number;
  usbProductId?: number;
}

export interface SerialPortFilter {
  usbVendorId?: number;
  usbProductId?: number;
}

export interface SerialOptions {
  baudRate: number;
  dataBits?: 7 | 8;
  stopBits?: 1 | 2;
  parity?: 'none' | 'even' | 'odd';
  bufferSize?: number;
  flowControl?: 'none' | 'hardware';
}

export interface SerialPort extends EventTarget {
  readonly readable: ReadableStream<Uint8Array> | null;
  readonly writable: WritableStream<Uint8Array> | null;
  open(options: SerialOptions): Promise<void>;
  close(): Promise<void>;
  getInfo(): SerialPortInfo;
}

export interface Serial extends EventTarget {
  requestPort(options?: { filters?: SerialPortFilter[] }): Promise<SerialPort>;
  getPorts(): Promise<SerialPort[]>;
}

/** `navigator` with the optional Web Serial entry point. */
export interface NavigatorWithSerial {
  serial?: Serial;
}
