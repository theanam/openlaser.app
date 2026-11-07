/**
 * Probing an unknown serial port: open it at a baud rate, send something harmless, and see whether
 * the device answers the way a given controller does. The port is closed again either way, so the
 * real connection opens it fresh.
 */
import { realScheduler, type Scheduler } from './scheduler';
import type { Transport } from './types';

/** What a probe found: the baud rate it answered at, and the model when the reply names one. */
export interface Detection {
  baudRate: number;
  model?: string;
}

export interface ProbeOptions {
  scheduler?: Scheduler;
  /** How long to listen at each baud rate. */
  listenMs?: number;
}

/**
 * Opens `transport` at `baudRate`, runs `talk` (which writes and returns a check over everything
 * received so far), and waits up to `listenMs` for the check to accept. Always closes the port.
 */
export async function listen<T>(
  transport: Transport,
  baudRate: number,
  talk: (write: (bytes: Uint8Array) => Promise<void>) => Promise<(received: Uint8Array) => T | null>,
  options: ProbeOptions = {},
): Promise<T | null> {
  const scheduler = options.scheduler ?? realScheduler;
  const listenMs = options.listenMs ?? 2000;
  let received = new Uint8Array(0);
  let check: ((r: Uint8Array) => T | null) | null = null;
  let found: T | null = null;
  let wake: (() => void) | null = null;
  try {
    await transport.open({ baudRate });
  } catch {
    return null;
  }
  const off = transport.onData((chunk) => {
    const next = new Uint8Array(received.length + chunk.length);
    next.set(received);
    next.set(chunk, received.length);
    received = next;
    found = check?.(received) ?? found;
    if (found !== null) wake?.();
  });
  try {
    check = await talk((bytes) => transport.write(bytes));
    found = check(received);
    if (found === null) {
      await new Promise<void>((resolve) => {
        wake = resolve;
        scheduler.setTimeout(resolve, listenMs);
      });
    }
    return found;
  } catch {
    return null;
  } finally {
    off();
    await transport.close().catch(() => undefined);
  }
}
