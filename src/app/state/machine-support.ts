/** Small helpers for the machine controller: screen wake lock and batched console updates. */
import type { ConsoleEntry } from '$lib/machine';

/** Keeps the screen awake during a job and takes the lock back when the tab returns (SPEC §7.3). */
export class JobWakeLock {
  private lock: WakeLockSentinel | null = null;
  private wanted = false;

  async acquire(): Promise<void> {
    this.wanted = true;
    try {
      this.lock = (await navigator.wakeLock?.request('screen')) ?? null;
    } catch {
      this.lock = null;
    }
  }

  async release(): Promise<void> {
    this.wanted = false;
    const lock = this.lock;
    this.lock = null;
    await lock?.release().catch(() => undefined);
  }

  /** Browsers drop the lock when the tab hides. */
  async onVisibilityChange(): Promise<void> {
    if (document.visibilityState === 'visible' && this.wanted && !this.lock) await this.acquire();
  }
}

/** Collects console entries and flushes them at most every 100 ms, capped to `limit`. */
export class ConsoleBatcher {
  private pending: ConsoleEntry[] = [];
  private timer: ReturnType<typeof setTimeout> | null = null;

  constructor(
    private readonly flush: (append: ConsoleEntry[]) => void,
    private readonly delayMs = 100,
  ) {}

  push(entry: ConsoleEntry): void {
    this.pending.push(entry);
    this.timer ??= setTimeout(() => {
      this.timer = null;
      const batch = this.pending;
      this.pending = [];
      this.flush(batch);
    }, this.delayMs);
  }
}

export function appendCapped<T>(list: T[], more: T[], limit: number): T[] {
  const next = list.concat(more);
  return next.length > limit ? next.slice(-limit) : next;
}
