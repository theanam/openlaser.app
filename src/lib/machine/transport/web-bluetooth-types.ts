/** The parts of the Web Bluetooth API the BLE transport uses (TypeScript's DOM lib has none). */

export interface BluetoothCharacteristic extends EventTarget {
  readonly uuid?: string;
  readonly properties?: {
    readonly write: boolean;
    readonly writeWithoutResponse: boolean;
    readonly notify: boolean;
    readonly indicate: boolean;
  };
  readonly value?: DataView;
  writeValueWithoutResponse(value: BufferSource): Promise<void>;
  writeValueWithResponse?(value: BufferSource): Promise<void>;
  startNotifications(): Promise<BluetoothCharacteristic>;
  stopNotifications(): Promise<BluetoothCharacteristic>;
}

export interface BluetoothService {
  readonly uuid?: string;
  getCharacteristic(uuid: string): Promise<BluetoothCharacteristic>;
  getCharacteristics?(): Promise<BluetoothCharacteristic[]>;
}

export interface BluetoothServer {
  readonly connected: boolean;
  connect(): Promise<BluetoothServer>;
  disconnect(): void;
  getPrimaryService(uuid: string): Promise<BluetoothService>;
  /** The services the page was allowed to see (those named in the request). */
  getPrimaryServices?(): Promise<BluetoothService[]>;
}

export interface BluetoothDeviceHandle extends EventTarget {
  readonly id: string;
  readonly name?: string;
  readonly gatt?: BluetoothServer;
}

export interface BluetoothRequestOptions {
  filters?: Array<{ namePrefix?: string; services?: string[] }>;
  optionalServices?: string[];
  acceptAllDevices?: boolean;
}

export interface Bluetooth {
  requestDevice(options: BluetoothRequestOptions): Promise<BluetoothDeviceHandle>;
  getDevices?(): Promise<BluetoothDeviceHandle[]>;
}

export interface NavigatorWithBluetooth {
  bluetooth?: Bluetooth;
}
