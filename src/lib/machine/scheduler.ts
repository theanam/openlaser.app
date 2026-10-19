/**
 * Time source and timers for the machine layer. Everything that waits (status polling, handshake
 * timeouts, simulated motion) goes through a Scheduler so tests can run on a virtual clock.
 */
export type TimerHandle = number;

export interface Scheduler {
  /** Monotonic milliseconds. */
  now(): number;
  setTimeout(cb: () => void, ms: number): TimerHandle;
  clearTimeout(handle: TimerHandle): void;
}

/** Real browser/Node timers. Used by the UI and the "Virtual machine" connection. */
export const realScheduler: Scheduler = {
  now: () => performance.now(),
  setTimeout: (cb, ms) => globalThis.setTimeout(cb, ms) as unknown as TimerHandle,
  clearTimeout: (handle) => globalThis.clearTimeout(handle),
};

/** Resolves after every pending microtask (promise callback) has run. */
export function flushMicrotasks(): Promise<void> {
  if (typeof setImmediate === 'function') return new Promise((resolve) => setImmediate(resolve));
  return new Promise((resolve) => globalThis.setTimeout(resolve, 0));
}
