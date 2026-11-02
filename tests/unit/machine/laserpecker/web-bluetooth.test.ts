import { describe, expect, it } from 'vitest';
import {
  BLE_CHUNK_BYTES,
  LASERPECKER_GATT,
  SERIAL_BRIDGE_SERVICES,
  WEAK_SIGNAL,
  WebBluetoothTransport,
  bluetoothLabel,
} from '$lib/machine/transport/web-bluetooth';
import type {
  Bluetooth,
  BluetoothCharacteristic,
  BluetoothDeviceHandle,
  BluetoothRequestOptions,
  BluetoothServer,
  BluetoothService,
} from '$lib/machine/transport/web-bluetooth-types';

class FakeCharacteristic extends EventTarget implements BluetoothCharacteristic {
  value?: DataView;
  writes: Array<{ at: number; bytes: number[] }> = [];
  notifying = false;

  constructor(private readonly clock: { now: number }) {
    super();
  }

  async writeValueWithoutResponse(value: BufferSource): Promise<void> {
    const bytes = value instanceof Uint8Array ? value : new Uint8Array(value as ArrayBuffer);
    this.writes.push({ at: this.clock.now, bytes: Array.from(bytes) });
  }

  async startNotifications(): Promise<BluetoothCharacteristic> {
    this.notifying = true;
    return this;
  }

  async stopNotifications(): Promise<BluetoothCharacteristic> {
    this.notifying = false;
    return this;
  }

  notify(bytes: number[]): void {
    this.value = new DataView(Uint8Array.from(bytes).buffer);
    this.dispatchEvent(new Event('characteristicvaluechanged'));
  }
}

/** A GATT server offering only the given service, so probing has to skip the others. */
function fakeDevice(serviceUuid: string, name = 'LaserPecker-II-1234') {
  const clock = { now: 0 };
  const profile = LASERPECKER_GATT.find((p) => p.service === serviceUuid)!;
  const write = new FakeCharacteristic(clock);
  const notify = new FakeCharacteristic(clock);
  const probed: string[] = [];
  const device = new EventTarget() as EventTarget & BluetoothDeviceHandle & { gatt: BluetoothServer };
  const server: BluetoothServer = {
    connected: false,
    async connect() {
      return server;
    },
    disconnect() {
      device.dispatchEvent(new Event('gattserverdisconnected'));
    },
    async getPrimaryService(uuid: string): Promise<BluetoothService> {
      probed.push(uuid);
      if (uuid !== serviceUuid) throw new DOMException('No service', 'NotFoundError');
      return {
        async getCharacteristic(c: string) {
          if (c === profile.write) return write;
          if (c === profile.notify) return notify;
          throw new DOMException('No characteristic', 'NotFoundError');
        },
      };
    },
  };
  Object.assign(device, { id: 'dev', name, gatt: server });
  return { device, write, notify, probed, clock };
}

function transportFor(rig: ReturnType<typeof fakeDevice>) {
  return new WebBluetoothTransport(rig.device, {
    now: () => rig.clock.now,
    sleep: async (ms) => void (rig.clock.now += ms),
  });
}

describe('bluetoothLabel', () => {
  it('names the model from the roman numeral, longest first', () => {
    expect(bluetoothLabel('LaserPecker-III109BFB')).toBe('LP3-109BFB');
    expect(bluetoothLabel('LaserPecker-II-1234')).toBe('LP2-1234');
    expect(bluetoothLabel('LaserPecker-IV0A1B2C')).toBe('LP4-0A1B2C');
    expect(bluetoothLabel('Other device')).toBe('Other device');
    expect(bluetoothLabel(undefined)).toBe('Bluetooth device');
  });
});

describe('WebBluetoothTransport', () => {
  it('asks for LaserPecker names and every bridge service', async () => {
    let asked: BluetoothRequestOptions | null = null;
    const rig = fakeDevice(LASERPECKER_GATT[0].service);
    const bluetooth: Bluetooth = {
      async requestDevice(options) {
        asked = options;
        return rig.device;
      },
    };
    const t = await WebBluetoothTransport.request({ bluetooth });
    expect(asked!.filters).toContainEqual({ namePrefix: 'LaserPecker' });
    expect(asked!.optionalServices).toEqual([
      ...LASERPECKER_GATT.map((p) => p.service),
      ...SERIAL_BRIDGE_SERVICES,
    ]);
    expect(t.label).toBe('LP2-1234');
  });

  it('probes the bridges in order and uses the first that answers', async () => {
    const rig = fakeDevice(LASERPECKER_GATT[2].service);
    const t = transportFor(rig);
    await t.open({ baudRate: 0 });
    expect(rig.probed).toEqual(LASERPECKER_GATT.map((p) => p.service));
    expect(t.profile?.name).toBe('ESP32');
    expect(rig.notify.notifying).toBe(true);
    expect(t.connected).toBe(true);
  });

  it('fails on a device without any known bridge', async () => {
    const rig = fakeDevice('0000aaaa-0000-1000-8000-00805f9b34fb');
    await expect(transportFor(rig).open({ baudRate: 0 })).rejects.toThrow(/not a LaserPecker/);
  });

  it('falls back to another serial bridge with write and notify characteristics', async () => {
    const rig = fakeDevice('0000aaaa-0000-1000-8000-00805f9b34fb');
    const uart = SERIAL_BRIDGE_SERVICES[0]!;
    const props = (
      p: Partial<Record<'write' | 'writeWithoutResponse' | 'notify' | 'indicate', boolean>>,
    ) => ({
      write: false,
      writeWithoutResponse: false,
      notify: false,
      indicate: false,
      ...p,
    });
    Object.assign(rig.write, { uuid: 'w', properties: props({ write: true }) });
    Object.assign(rig.notify, { uuid: 'n', properties: props({ notify: true }) });
    const sent: number[][] = [];
    Object.assign(rig.write, { writeValueWithResponse: async (v: Uint8Array) => void sent.push([...v]) });
    rig.device.gatt.getPrimaryServices = async () => [
      {
        uuid: uart,
        getCharacteristic: async () => rig.write,
        getCharacteristics: async () => [rig.notify, rig.write],
      },
    ];
    const t = transportFor(rig);
    await t.open({ baudRate: 0 });
    expect(t.profile).toMatchObject({ service: uart, write: 'w', notify: 'n' });
    await t.write(Uint8Array.of(1, 2));
    expect(sent).toEqual([[1, 2]]);
  });

  it('reports a weak signal when the link drops while the services are listed', async () => {
    const rig = fakeDevice(LASERPECKER_GATT[1].service);
    const lookup = rig.device.gatt.getPrimaryService;
    rig.device.gatt.getPrimaryService = async (uuid) => {
      rig.device.dispatchEvent(new Event('gattserverdisconnected'));
      return lookup(uuid);
    };
    await expect(transportFor(rig).open({ baudRate: 0 })).rejects.toThrow(WEAK_SIGNAL);
  });

  it('reports a weak signal when connecting or a lookup fails on the link', async () => {
    const failing = fakeDevice(LASERPECKER_GATT[1].service);
    failing.device.gatt.connect = async () => {
      throw new DOMException('Connection failed for unknown reason.', 'NetworkError');
    };
    await expect(transportFor(failing).open({ baudRate: 0 })).rejects.toThrow(WEAK_SIGNAL);
    const lost = fakeDevice(LASERPECKER_GATT[1].service);
    lost.device.gatt.getPrimaryService = async () => {
      throw new DOMException('GATT Server is disconnected.', 'NetworkError');
    };
    await expect(transportFor(lost).open({ baudRate: 0 })).rejects.toThrow(WEAK_SIGNAL);
  });

  it('names the services it found when none fits', async () => {
    const rig = fakeDevice('0000aaaa-0000-1000-8000-00805f9b34fb');
    rig.device.gatt.getPrimaryServices = async () => [
      {
        uuid: '0000ffe0-0000-1000-8000-00805f9b34fb',
        getCharacteristic: async () => rig.write,
        getCharacteristics: async () => [],
      },
    ];
    await expect(transportFor(rig).open({ baudRate: 0 })).rejects.toThrow(/Services: 0000ffe0/);
  });

  it('writes in 179-byte chunks at least 100 ms apart, in order', async () => {
    const rig = fakeDevice(LASERPECKER_GATT[0].service);
    const t = transportFor(rig);
    await t.open({ baudRate: 0 });
    const data = Uint8Array.from({ length: 400 }, (_, i) => i & 0xff);
    await Promise.all([t.write(data), t.write(Uint8Array.of(1, 2))]);
    expect(rig.write.writes.map((w) => w.bytes.length)).toEqual([BLE_CHUNK_BYTES, BLE_CHUNK_BYTES, 42, 2]);
    const times = rig.write.writes.map((w) => w.at);
    for (let i = 1; i < times.length; i++) expect(times[i] - times[i - 1]).toBeGreaterThanOrEqual(100);
    expect(rig.write.writes.flatMap((w) => w.bytes).slice(0, 400)).toEqual(Array.from(data));
  });

  it('passes notifications on and reports a dropped link', async () => {
    const rig = fakeDevice(LASERPECKER_GATT[1].service);
    const t = transportFor(rig);
    const received: number[][] = [];
    const lost: string[] = [];
    t.onData((chunk) => received.push(Array.from(chunk)));
    t.onDisconnect((reason) => lost.push(reason));
    await t.open({ baudRate: 0 });
    rig.notify.notify([0xaa, 0xbb, 0x08]);
    rig.notify.notify([0x00, 0x06]);
    expect(received).toEqual([
      [0xaa, 0xbb, 0x08],
      [0x00, 0x06],
    ]);
    rig.device.dispatchEvent(new Event('gattserverdisconnected'));
    expect(lost).toEqual(['Bluetooth link lost']);
    expect(t.connected).toBe(false);
    await expect(t.write(Uint8Array.of(1))).rejects.toThrow(/Not connected/);
  });

  it('closes without reporting a loss', async () => {
    const rig = fakeDevice(LASERPECKER_GATT[0].service);
    const t = transportFor(rig);
    const lost: string[] = [];
    t.onDisconnect((reason) => lost.push(reason));
    await t.open({ baudRate: 0 });
    await t.close();
    await t.close();
    expect(lost).toEqual([]);
    expect(rig.notify.notifying).toBe(false);
  });
});
