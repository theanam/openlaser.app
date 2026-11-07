import type { Scheduler } from '../scheduler';
import { Listeners } from '../store';
import type { Unsubscribe } from '../types';
import type { SimulatorFaults } from './faults';

/** Bytes that can never form "ok", "error", "ALARM", "<" or "[": line noise only. */
const GARBAGE_ALPHABET = [0x00, 0x7f, 0x80, 0x9f, 0xc3, 0xfe, 0xff, 0x23, 0x25, 0x2a, 0x7c, 0x40];

/** Serial output of the simulated controller, with optional delay, noise and chunk splitting. */
export class SimulatorOutput {
  private readonly listeners = new Listeners<Uint8Array>();
  /** Keeps output ordered when the delay changes between writes. */
  private lastDueAt = 0;
  /** Bumped on power off so output still scheduled from before is dropped. */
  private generation = 0;

  constructor(
    private readonly scheduler: Scheduler,
    private readonly random: () => number,
    private readonly faults: () => SimulatorFaults,
  ) {}

  onData(cb: (bytes: Uint8Array) => void): Unsubscribe {
    return this.listeners.add(cb);
  }

  sendLine(text: string): void {
    const faults = this.faults();
    if (faults.garbageProbability && this.random() < faults.garbageProbability) this.emit(this.garbage());
    this.emit(Uint8Array.from(`${text}\r\n`, (c) => c.charCodeAt(0) & 0xff));
  }

  /** Noise like a board prints while booting. */
  sendGarbage(): void {
    this.emit(this.garbage());
  }

  private garbage(): Uint8Array {
    const length = 1 + Math.floor(this.random() * 12);
    const bytes = new Uint8Array(length + 2);
    for (let i = 0; i < length; i++)
      bytes[i] = GARBAGE_ALPHABET[Math.floor(this.random() * GARBAGE_ALPHABET.length)];
    bytes[length] = 0x0d;
    bytes[length + 1] = 0x0a;
    return bytes;
  }

  private emit(bytes: Uint8Array): void {
    const faults = this.faults();
    const pieces: Uint8Array[] = [];
    if (faults.splitChunks) {
      for (let offset = 0; offset < bytes.length;) {
        const size = 1 + Math.floor(this.random() * Math.max(1, faults.splitChunks.maxPieceBytes));
        pieces.push(bytes.subarray(offset, offset + size));
        offset += size;
      }
    } else {
      pieces.push(bytes);
    }
    const delay = faults.responseDelayMs ?? 0;
    if (delay <= 0 && this.lastDueAt <= this.scheduler.now()) {
      for (const piece of pieces) this.listeners.emit(piece);
      return;
    }
    const dueAt = Math.max(this.scheduler.now() + delay, this.lastDueAt);
    this.lastDueAt = dueAt;
    const generation = this.generation;
    for (const piece of pieces) {
      this.scheduler.setTimeout(() => {
        if (generation === this.generation) this.listeners.emit(piece);
      }, dueAt - this.scheduler.now());
    }
  }

  /** Drops everything not yet delivered (power off). */
  reset(): void {
    this.lastDueAt = 0;
    this.generation++;
  }
}
