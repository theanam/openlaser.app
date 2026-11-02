/**
 * An in-process LaserPecker for tests and the "Virtual LaserPecker" connection. It answers the
 * same frames a real LP2 does, takes raw uploads, and runs a job by counting its progress up.
 */
import { realScheduler, type Scheduler } from '../scheduler';
import { Listeners } from '../store';
import type { Transport, Unsubscribe } from '../types';
import { Func, PreviewState, PrintState, Query } from './commands';
import { FrameReader, encodeFrame } from './frame';

export interface VirtualLaserPeckerOptions {
  scheduler?: Scheduler;
  /** Firmware version, e.g. 316 for 3.16. */
  software?: number;
  /** Progress percent added per step, and the step length. */
  progressStep?: number;
  stepMs?: number;
  /** Answer upload announcements with the stuck-device refusal. */
  refuseUploads?: boolean;
  /** Send every reply twice, as the LP3 does over Bluetooth. */
  doubleReplies?: boolean;
}

const u32 = (v: number) => [(v >>> 24) & 0xff, (v >>> 16) & 0xff, (v >>> 8) & 0xff, v & 0xff];

export class VirtualLaserPecker implements Transport {
  readonly kind = 'simulator' as const;
  readonly label = 'Virtual LaserPecker';
  mode = 6;
  subState = 0;
  progress = 0;
  errorCode = 0;
  fileId = 0;
  power = 0;
  /** Laser type and object diameter (mm) of the last print start. */
  laserType = 0;
  objectDiameter = 0;
  /** Settings fields from reply offset 4: rotary flag at 11, slide flag at 12. */
  readonly settings: number[] = new Array<number>(19).fill(0);
  /** Every frame received, as [func, ...data]. Raw upload bytes are not included. */
  readonly received: number[][] = [];
  /** Uploaded files by id. */
  readonly files = new Map<number, Uint8Array>();
  /** Stop answering, as a device that hung or walked out of range. */
  silent = false;
  private open_ = false;
  private receiving: { total: number; bytes: number[] } | null = null;
  private reader = new FrameReader();
  private timer: number | null = null;
  private readonly data = new Listeners<Uint8Array>();
  private readonly disconnects = new Listeners<string>();
  private readonly scheduler: Scheduler;

  constructor(private readonly options: VirtualLaserPeckerOptions = {}) {
    this.scheduler = options.scheduler ?? realScheduler;
  }

  get connected(): boolean {
    return this.open_;
  }

  async open(_options: { baudRate: number }): Promise<void> {
    if (this.open_) throw new Error('Already open');
    this.open_ = true;
  }

  async close(): Promise<void> {
    this.open_ = false;
    this.stopTimer();
  }

  async write(bytes: Uint8Array): Promise<void> {
    if (!this.open_) throw new Error('Not connected');
    let rest = bytes;
    if (this.receiving) {
      const take = Math.min(rest.length, this.receiving.total - this.receiving.bytes.length);
      this.receiving.bytes.push(...rest.subarray(0, take));
      rest = rest.subarray(take);
      if (this.receiving.bytes.length === this.receiving.total) this.store();
    }
    if (rest.length === 0) return;
    for (const frame of this.reader.push(rest)) {
      if (frame.kind !== 'short') continue;
      const data = Array.from(frame.bytes.subarray(4, frame.bytes.length - 2));
      this.received.push([frame.func, ...data]);
      this.handle(frame.func, data);
    }
  }

  onData(cb: (chunk: Uint8Array) => void): Unsubscribe {
    return this.data.add(cb);
  }

  onDisconnect(cb: (reason: string) => void): Unsubscribe {
    return this.disconnects.add(cb);
  }

  /** The radio link drops, as when the laser is switched off. */
  dropLink(): void {
    if (!this.open_) return;
    this.open_ = false;
    this.stopTimer();
    this.disconnects.emit('Bluetooth link lost');
  }

  /** Functions received, in order. */
  get funcs(): number[] {
    return this.received.map((f) => f[0]);
  }

  private reply(func: number, data: number[]): void {
    if (this.silent) return;
    const frame = encodeFrame(func, data);
    const copies = this.options.doubleReplies ? 2 : 1;
    for (let i = 0; i < copies; i++) {
      queueMicrotask(() => {
        if (this.open_) this.data.emit(frame);
      });
    }
  }

  private handle(func: number, data: number[]): void {
    switch (func) {
      case Func.query:
        if (data[0] === Query.status) this.reply(Func.query, this.status());
        else if (data[0] === Query.version) {
          const sw = this.options.software ?? 316;
          this.reply(Func.query, [sw >> 8, sw & 0xff, 0x01, 0x32, 0x1e, 0x86, 0, 0]);
        } else if (data[0] === Query.settings) {
          this.reply(Func.query, this.settings);
        } else if (data[0] === Query.fileIds) {
          this.reply(Func.query, [this.files.size, ...[...this.files.keys()].flatMap(u32)]);
        }
        return;
      case Func.settings:
        // The write carries a leading 1, then the reply's fields with two slots sent as 0.
        this.settings[11] = data[11];
        this.settings[12] = data[12];
        this.reply(Func.settings, [1, 0]);
        return;
      case Func.exit:
        this.reply(Func.exit, [0, 0, 0, 0, 0]);
        return;
      case Func.file:
        if (data[0] !== 1) return;
        if (this.options.refuseUploads) {
          this.reply(Func.exit, [1, ...data.slice(1, 5)]);
          return;
        }
        this.receiving = { total: (data[1] << 24) | (data[2] << 16) | (data[3] << 8) | data[4], bytes: [] };
        this.reply(Func.file, [1, 1, 0, 0, 0]);
        return;
      case Func.print:
        this.print(data);
        return;
      case Func.preview:
        if (data[0] === PreviewState.rectangle || data[0] === PreviewState.rotary) {
          [this.mode, this.subState, this.objectDiameter] = [2, 2, ((data[12] << 8) | data[13]) / 100];
        } else if (data[0] === PreviewState.stop && this.mode === 2) [this.mode, this.subState] = [6, 255];
        return;
    }
  }

  private print(data: number[]): void {
    switch (data[0]) {
      case PrintState.start: {
        const id = ((data[3] << 24) | (data[4] << 16) | (data[5] << 8) | data[6]) >>> 0;
        if (!this.files.has(id)) {
          [this.mode, this.errorCode] = [5, 7];
          return;
        }
        [this.mode, this.subState, this.progress, this.fileId, this.power] = [1, 1, 0, id, data[1]];
        this.laserType = data[13];
        this.objectDiameter = ((data[14] << 8) | data[15]) / 100;
        this.startTimer();
        return;
      }
      case PrintState.pause:
        if (this.mode === 1) [this.mode, this.subState] = [6, 4];
        this.stopTimer();
        return;
      case PrintState.resume:
        if (this.subState === 4) [this.mode, this.subState] = [1, 1];
        this.startTimer();
        return;
      case PrintState.stop:
        if (this.mode === 1 || this.subState === 4) [this.mode, this.subState] = [6, 255];
        this.stopTimer();
        return;
    }
  }

  private store(): void {
    const bytes = Uint8Array.from(this.receiving?.bytes ?? []);
    this.receiving = null;
    const id = ((bytes[5] << 24) | (bytes[6] << 16) | (bytes[7] << 8) | bytes[8]) >>> 0;
    this.files.set(id, bytes);
    this.reply(Func.file, [2, 1, 0, 0, 0]);
  }

  private status(): number[] {
    const out = new Array<number>(21).fill(0);
    out[0] = this.mode;
    out[1] = this.subState;
    out[2] = this.progress;
    out[3] = this.power;
    out[5] = this.errorCode;
    out.splice(7, 4, ...u32(this.fileId));
    out[11] = 30;
    out[20] = 1;
    return out;
  }

  private startTimer(): void {
    this.stopTimer();
    this.timer = this.scheduler.setTimeout(() => {
      this.timer = null;
      if (this.mode !== 1) return;
      this.progress = Math.min(100, this.progress + (this.options.progressStep ?? 10));
      if (this.progress >= 100) [this.mode, this.subState] = [6, 255];
      else this.startTimer();
    }, this.options.stepMs ?? 500);
  }

  private stopTimer(): void {
    if (this.timer !== null) this.scheduler.clearTimeout(this.timer);
    this.timer = null;
  }
}
