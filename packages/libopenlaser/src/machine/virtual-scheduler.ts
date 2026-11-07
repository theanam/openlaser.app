import { flushMicrotasks, type Scheduler, type TimerHandle } from './scheduler';

interface VirtualTimer {
  handle: TimerHandle;
  due: number;
  /** Insertion order, so timers due at the same instant fire in the order they were set. */
  seq: number;
  cb: () => void;
}

export class DeadlockError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'DeadlockError';
  }
}

/**
 * Deterministic clock for tests: time only moves when the test advances it. Between timers it
 * lets all pending promise callbacks run, so event-driven code behaves as it would in real time.
 */
export class VirtualScheduler implements Scheduler {
  private time = 0;
  private nextHandle = 1;
  private seq = 0;
  private timers: VirtualTimer[] = [];

  now(): number {
    return this.time;
  }

  setTimeout(cb: () => void, ms: number): TimerHandle {
    const handle = this.nextHandle++;
    this.timers.push({ handle, due: this.time + Math.max(0, ms), seq: this.seq++, cb });
    return handle;
  }

  clearTimeout(handle: TimerHandle): void {
    this.timers = this.timers.filter((t) => t.handle !== handle);
  }

  get pendingTimers(): number {
    return this.timers.length;
  }

  /** Moves time forward by `ms`, firing every timer that falls due on the way. */
  async advance(ms: number): Promise<void> {
    const target = this.time + ms;
    await flushMicrotasks();
    for (;;) {
      const next = this.peek();
      if (!next || next.due > target) break;
      this.fire(next);
      await flushMicrotasks();
    }
    this.time = target;
    await flushMicrotasks();
  }

  /**
   * Runs timers until `promise` settles. Throws if nothing is left to run (deadlock) or the
   * virtual time budget is exhausted.
   */
  async runUntil<T>(promise: Promise<T>, maxMs = 24 * 3600_000): Promise<T> {
    let settled = false;
    const tracked = promise.finally(() => {
      settled = true;
    });
    // Avoid an unhandled rejection warning while we are still driving the clock.
    tracked.catch(() => undefined);
    const deadline = this.time + maxMs;
    await flushMicrotasks();
    while (!settled) {
      const next = this.peek();
      if (!next) throw new DeadlockError('Promise never settled and no timers are pending');
      if (next.due > deadline)
        throw new DeadlockError(`Promise did not settle within ${maxMs} ms of virtual time`);
      this.fire(next);
      await flushMicrotasks();
    }
    return tracked;
  }

  private peek(): VirtualTimer | undefined {
    let best: VirtualTimer | undefined;
    for (const t of this.timers) {
      if (!best || t.due < best.due || (t.due === best.due && t.seq < best.seq)) best = t;
    }
    return best;
  }

  private fire(timer: VirtualTimer): void {
    this.timers = this.timers.filter((t) => t !== timer);
    this.time = Math.max(this.time, timer.due);
    timer.cb();
  }
}
