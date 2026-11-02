/**
 * Request and reply matching over one LaserPecker connection. Requests go out one at a time and
 * each waits for the first frame its matcher accepts; the device also sends frames unprompted, so
 * frames nobody waits for are only logged.
 */
import { Listeners } from '../store';
import type { Scheduler } from '../scheduler';
import type { Transport, Unsubscribe } from '../types';
import { FrameReader, type DeviceFrame, type ShortFrame } from './frame';

export class ReplyTimeoutError extends Error {
  override name = 'ReplyTimeoutError';
}

export type FrameMatcher = (frame: ShortFrame) => boolean;

interface Waiter {
  match: FrameMatcher;
  resolve: (frame: ShortFrame) => void;
  reject: (error: Error) => void;
  timer: number;
}

export type LinkLog = { direction: 'sent' | 'received'; bytes: Uint8Array; matched: boolean };

/**
 * The LP3 sends every reply twice over Bluetooth. A copy arriving this soon after the original
 * is dropped, so it can never answer the next request.
 */
export const DUPLICATE_WINDOW_MS = 250;

export class LaserPeckerLink {
  private readonly reader = new FrameReader();
  private waiters: Waiter[] = [];
  private queue: Promise<unknown> = Promise.resolve();
  private last: { bytes: Uint8Array; at: number } | null = null;
  private readonly subscriptions: Unsubscribe[];
  readonly log = new Listeners<LinkLog>();
  readonly frames = new Listeners<DeviceFrame>();

  constructor(
    readonly transport: Transport,
    private readonly scheduler: Scheduler,
  ) {
    this.subscriptions = [transport.onData((chunk) => this.receive(chunk))];
  }

  /** Writes now, ahead of anything queued. For Stop and raw upload data. */
  async write(bytes: Uint8Array, logged = true): Promise<void> {
    if (logged) this.log.emit({ direction: 'sent', bytes, matched: true });
    await this.transport.write(bytes);
  }

  /** Waits for a matching frame without sending anything. Register before the action that causes it. */
  expect(match: FrameMatcher, timeoutMs: number): Promise<ShortFrame> {
    return new Promise<ShortFrame>((resolve, reject) => {
      const waiter: Waiter = {
        match,
        resolve,
        reject,
        timer: this.scheduler.setTimeout(() => {
          this.waiters = this.waiters.filter((w) => w !== waiter);
          reject(new ReplyTimeoutError('No reply from the laser.'));
        }, timeoutMs),
      };
      this.waiters.push(waiter);
    });
  }

  /** Sends a command after the previous request has its reply, and waits for this one's. */
  request(bytes: Uint8Array, match: FrameMatcher, timeoutMs: number): Promise<ShortFrame> {
    const run = this.queue.then(async () => {
      const reply = this.expect(match, timeoutMs);
      await this.write(bytes);
      return reply;
    });
    this.queue = run.catch(() => undefined);
    return run;
  }

  /** Fails every waiter, e.g. when the link drops. */
  failAll(error: Error): void {
    const waiters = this.waiters;
    this.waiters = [];
    for (const w of waiters) {
      this.scheduler.clearTimeout(w.timer);
      w.reject(error);
    }
  }

  dispose(): void {
    for (const off of this.subscriptions) off();
    this.failAll(new Error('Disconnected'));
    this.reader.reset();
  }

  private receive(chunk: Uint8Array): void {
    for (const frame of this.reader.push(chunk)) {
      if (frame.kind === 'short' && this.isRepeat(frame.bytes)) {
        this.log.emit({ direction: 'received', bytes: frame.bytes, matched: false });
        continue;
      }
      this.frames.emit(frame);
      if (frame.kind !== 'short') continue;
      const waiter = this.waiters.find((w) => w.match(frame));
      this.log.emit({ direction: 'received', bytes: frame.bytes, matched: waiter !== undefined });
      if (!waiter) continue;
      this.waiters = this.waiters.filter((w) => w !== waiter);
      this.scheduler.clearTimeout(waiter.timer);
      waiter.resolve(frame);
    }
  }

  private isRepeat(bytes: Uint8Array): boolean {
    const now = this.scheduler.now();
    const last = this.last;
    this.last = { bytes, at: now };
    return (
      last !== null &&
      now - last.at < DUPLICATE_WINDOW_MS &&
      last.bytes.length === bytes.length &&
      last.bytes.every((b, i) => b === bytes[i])
    );
  }
}
