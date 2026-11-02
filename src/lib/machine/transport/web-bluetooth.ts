import { Listeners } from '../store';
import type { Transport, Unsubscribe } from '../types';
import type {
  Bluetooth,
  BluetoothCharacteristic,
  BluetoothDeviceHandle,
  BluetoothServer,
  NavigatorWithBluetooth,
} from './web-bluetooth-types';

/** A BLE serial bridge: one service with a write and a notify characteristic. */
export interface GattProfile {
  name: string;
  service: string;
  write: string;
  notify: string;
}

const uuid16 = (short: string) => `0000${short}-0000-1000-8000-00805f9b34fb`;

/**
 * LaserPecker's BLE bridges, probed in this order (from the LaserPecker protocol notes by nerdocs,
 * https://github.com/nerdocs/pyrograph/blob/main/docs/protocol.md): the ISSC transparent UART the
 * LP2 uses, a generic fff0 bridge, and the ESP32 bridge on newer models.
 */
export const LASERPECKER_GATT: readonly GattProfile[] = [
  {
    name: 'ISSC',
    service: '49535343-fe7d-4ae5-8fa9-9fafd205e455',
    write: '49535343-8841-43f4-a8d4-ecbe34729bb3',
    notify: '49535343-1e4d-4bd9-ba61-23c647249616',
  },
  { name: 'FFF0', service: uuid16('fff0'), write: uuid16('fff2'), notify: uuid16('fff1') },
  { name: 'ESP32', service: uuid16('abf0'), write: uuid16('abf3'), notify: uuid16('abf4') },
];

/**
 * Common BLE serial bridges beyond the three above (Nordic UART, HM-10 style, and other modules).
 * Asked for too, so a LaserPecker on a bridge the notes do not list can still be reached: the first
 * of these with a write and a notify characteristic is used.
 */
export const SERIAL_BRIDGE_SERVICES: readonly string[] = [
  '6e400001-b5a3-f393-e0a9-e50e24dcca9e',
  ...['ffe0', 'ffe5', 'ff00', 'ff10', 'ff12', 'ffb0', 'ae00', 'ae30', '18f0', 'fee7', 'dfb0'].map(uuid16),
];

/** Chrome cannot read signal strength; a link that fails or drops while opening is the sign. */
export const WEAK_SIGNAL = 'Weak Bluetooth signal. Move the laser closer and try again.';

/** Bytes per BLE write and the pause between writes. */
export const BLE_CHUNK_BYTES = 179;
export const BLE_CHUNK_GAP_MS = 100;

const ROMAN: Record<string, number> = { I: 1, II: 2, III: 3, IV: 4, V: 5 };

/**
 * LaserPeckers advertise "LaserPecker-" plus the model in roman numerals and an id, e.g.
 * "LaserPecker-III109BFB" for an LP3. Shown as "LP3-109BFB". The id is hex, so the longest
 * numeral is the model.
 */
export function bluetoothLabel(name: string | undefined): string {
  if (!name) return 'Bluetooth device';
  const m = /^LaserPecker-(IV|V|III|II|I)-?(.*)$/.exec(name);
  return m ? `LP${ROMAN[m[1]]}-${m[2]}` : name;
}

async function listServices(server: BluetoothServer): Promise<string[]> {
  const services = (await server.getPrimaryServices?.().catch(() => [])) ?? [];
  return services.flatMap((s) => (s.uuid ? [s.uuid] : []));
}

function navigatorBluetooth(): Bluetooth | undefined {
  if (typeof navigator === 'undefined') return undefined;
  return (navigator as Navigator & NavigatorWithBluetooth).bluetooth;
}

/** Chrome and Edge on desktop and Android. */
export function isWebBluetoothSupported(): boolean {
  return navigatorBluetooth() !== undefined;
}

export interface WebBluetoothOptions {
  profiles?: readonly GattProfile[];
  chunkBytes?: number;
  gapMs?: number;
  /** Injectable for tests. */
  sleep?: (ms: number) => Promise<void>;
  now?: () => number;
}

const realSleep = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms));

/**
 * Web Bluetooth transport for BLE serial bridges. Writes go out without response in small chunks
 * with a pause between them, one at a time; notifications are passed on as they arrive (the
 * protocol's frame reader puts split replies back together). The device dropping off is reported
 * as a disconnect.
 */
export class WebBluetoothTransport implements Transport {
  readonly kind = 'webbluetooth' as const;
  readonly label: string;
  /** The GATT profile that answered, once open. */
  profile: GattProfile | null = null;
  private open_ = false;
  private writer: BluetoothCharacteristic | null = null;
  private notifier: BluetoothCharacteristic | null = null;
  private writeChain: Promise<void> = Promise.resolve();
  private lastWrite = -Infinity;
  private readonly dataListeners = new Listeners<Uint8Array>();
  private readonly disconnectListeners = new Listeners<string>();
  private readonly profiles: readonly GattProfile[];
  private readonly chunkBytes: number;
  private readonly gapMs: number;
  private readonly sleep: (ms: number) => Promise<void>;
  private readonly now: () => number;

  /** Shows the browser's device picker. Must be called from a user gesture (click). */
  static async request(
    options: WebBluetoothOptions & { bluetooth?: Bluetooth } = {},
  ): Promise<WebBluetoothTransport> {
    const bluetooth = options.bluetooth ?? navigatorBluetooth();
    if (!bluetooth) throw new Error('Bluetooth needs Chrome or Edge.');
    const profiles = options.profiles ?? LASERPECKER_GATT;
    const device = await bluetooth.requestDevice({
      filters: [
        { namePrefix: 'LaserPecker' },
        { namePrefix: 'LP' },
        ...profiles.map((p) => ({ services: [p.service] })),
      ],
      optionalServices: [...profiles.map((p) => p.service), ...SERIAL_BRIDGE_SERVICES],
    });
    return new WebBluetoothTransport(device, options);
  }

  constructor(
    readonly device: BluetoothDeviceHandle,
    options: WebBluetoothOptions = {},
  ) {
    this.label = bluetoothLabel(device.name);
    this.profiles = options.profiles ?? LASERPECKER_GATT;
    this.chunkBytes = options.chunkBytes ?? BLE_CHUNK_BYTES;
    this.gapMs = options.gapMs ?? BLE_CHUNK_GAP_MS;
    this.sleep = options.sleep ?? realSleep;
    this.now = options.now ?? (() => performance.now());
  }

  get connected(): boolean {
    return this.open_;
  }

  /** The baud rate is meaningless over BLE and ignored. */
  async open(_options: { baudRate: number }): Promise<void> {
    if (this.open_) throw new Error('Already connected');
    const gatt = this.device.gatt;
    if (!gatt) throw new Error('This device has no Bluetooth LE services.');
    // A weak link fails to connect, or drops while the services are listed.
    let dropped = false;
    const onDrop = () => (dropped = true);
    this.device.addEventListener('gattserverdisconnected', onDrop);

    try {
      const server = await gatt.connect();
      await this.findProfile(server);
      if (!this.writer || !this.notifier) await this.findBridge(server);
    } catch {
      dropped = true;
    } finally {
      this.device.removeEventListener('gattserverdisconnected', onDrop);
    }
    if (dropped) {
      this.writer = this.notifier = this.profile = null;
      gatt.disconnect();
      throw new Error(WEAK_SIGNAL);
    }
    if (!this.writer || !this.notifier) {
      const seen = await listServices(gatt);
      gatt.disconnect();
      throw new Error(
        `This Bluetooth device is not a LaserPecker.${seen.length ? ` Services: ${seen.join(', ')}` : ''}`,
      );
    }
    this.notifier.addEventListener('characteristicvaluechanged', this.handleValue);
    await this.notifier.startNotifications().catch(() => {
      gatt.disconnect();
      throw new Error(WEAK_SIGNAL);
    });
    this.device.addEventListener('gattserverdisconnected', this.handleDisconnect);
    this.writeChain = Promise.resolve();
    this.open_ = true;
  }

  /** The first known bridge the device has. Only "not found" moves on; other errors are the link. */
  private async findProfile(server: BluetoothServer): Promise<void> {
    for (const profile of this.profiles) {
      let service;
      try {
        service = await server.getPrimaryService(profile.service);
      } catch (error) {
        if (error instanceof DOMException && error.name === 'NotFoundError') continue;
        throw error;
      }
      this.writer = await service.getCharacteristic(profile.write);
      this.notifier = await service.getCharacteristic(profile.notify);
      this.profile = profile;
      return;
    }
  }

  /** Any other allowed service with a write and a notify characteristic. */
  private async findBridge(server: BluetoothServer): Promise<void> {
    for (const service of (await server.getPrimaryServices?.().catch(() => [])) ?? []) {
      const chars = (await service.getCharacteristics?.().catch(() => [])) ?? [];
      const write = chars.find((c) => c.properties?.writeWithoutResponse || c.properties?.write);
      const notify = chars.find((c) => c.properties?.notify || c.properties?.indicate);
      if (!write?.uuid || !notify?.uuid || !service.uuid) continue;
      this.writer = write;
      this.notifier = notify;
      this.profile = {
        name: `Bridge ${service.uuid}`,
        service: service.uuid,
        write: write.uuid,
        notify: notify.uuid,
      };
      return;
    }
  }

  write(data: Uint8Array): Promise<void> {
    if (!this.open_) return Promise.reject(new Error('Not connected'));
    const run = this.writeChain.then(() => this.writeChunks(data));
    this.writeChain = run.catch(() => undefined);
    return run;
  }

  async close(): Promise<void> {
    if (!this.open_) return;
    this.open_ = false;
    this.device.removeEventListener('gattserverdisconnected', this.handleDisconnect);
    this.notifier?.removeEventListener('characteristicvaluechanged', this.handleValue);
    await this.notifier?.stopNotifications().catch(() => undefined);
    this.device.gatt?.disconnect();
    this.writer = null;
    this.notifier = null;
  }

  onData(cb: (chunk: Uint8Array) => void): Unsubscribe {
    return this.dataListeners.add(cb);
  }

  onDisconnect(cb: (reason: string) => void): Unsubscribe {
    return this.disconnectListeners.add(cb);
  }

  private async writeChunks(data: Uint8Array): Promise<void> {
    for (let at = 0; at < data.length; at += this.chunkBytes) {
      if (!this.open_ || !this.writer) throw new Error('Not connected');
      const wait = this.lastWrite + this.gapMs - this.now();
      if (wait > 0) await this.sleep(wait);
      const chunk = data.slice(at, at + this.chunkBytes);
      if (
        this.writer.properties &&
        !this.writer.properties.writeWithoutResponse &&
        this.writer.writeValueWithResponse
      )
        await this.writer.writeValueWithResponse(chunk);
      else await this.writer.writeValueWithoutResponse(chunk);
      this.lastWrite = this.now();
    }
  }

  private readonly handleValue = (event: Event): void => {
    const view = (event.target as BluetoothCharacteristic).value;
    if (!view || !this.open_) return;
    this.dataListeners.emit(
      new Uint8Array(view.buffer.slice(view.byteOffset, view.byteOffset + view.byteLength)),
    );
  };

  private readonly handleDisconnect = (): void => {
    if (!this.open_) return;
    this.open_ = false;
    this.writer = null;
    this.notifier = null;
    this.disconnectListeners.emit('Bluetooth link lost');
  };
}
