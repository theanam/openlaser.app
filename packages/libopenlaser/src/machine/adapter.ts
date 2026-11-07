/**
 * The contract every live machine connection meets, whatever protocol it speaks. The UI drives
 * machines only through this (and its app-layer adapter), so a new machine is a new
 * implementation, never a new branch in the UI.
 *
 * Payloads are opaque here: each controller's CAM encoder produces them and its connection reads
 * them. The machine layer still knows nothing about projects or CAM.
 */
import type { ConsoleEntry, Readable, Unsubscribe } from './types';

export type ConnectionActivity =
  /** Connected, nothing running. */
  | 'idle'
  /** Tracing the job outline. */
  | 'framing'
  /** Moving a job to the machine before it starts (uploads). */
  | 'sending'
  | 'running'
  | 'paused'
  | 'stopping'
  /** Moving or busy outside a job (jogging, homing, a job started on the machine itself). */
  | 'busy';

export interface ConnectionStatus {
  connection: 'disconnected' | 'connecting' | 'connected';
  activity: ConnectionActivity;
  /** Percent of the current job, frame or upload; null when unknown or idle. */
  progress: number | null;
  /** What the machine reports as wrong right now (an alarm, a device error), or null. */
  error: string | null;
}

export type RunOutcome =
  { outcome: 'completed' } | { outcome: 'aborted' } | { outcome: 'failed'; reason: string };

/** What a connection can do beyond connect, run and stop. */
export interface ConnectionCapabilities {
  /** `frame` traces the outline. */
  frame: boolean;
  /** `pause` and `resume` hold and continue a running job. */
  pause: boolean;
  /** `console` streams what was sent and received. */
  console: boolean;
}

/**
 * A live link to one machine. `Job` and `Frame` are what this controller's encoder produces.
 *
 * Safety (docs/decisions.md): nothing starts or resumes unless `run`, `frame` or `resume` is
 * called; `stop` works at any time without waiting for the machine; a dropped link ends a running
 * job as failed and fires `onLost`.
 */
export interface MachineConnection<Job = unknown, Frame = unknown> {
  readonly status: Readable<ConnectionStatus>;
  readonly capabilities: ConnectionCapabilities;
  /** Something is running, moving or held, so Stop has work to do. */
  readonly canStop: boolean;
  /** Resolves when the frame ends: done, stopped, or failed. */
  frame(frame: Frame): Promise<RunOutcome>;
  /** Resolves when the job ends: done, stopped, or failed. */
  run(job: Job): Promise<RunOutcome>;
  pause(): Promise<void>;
  resume(): Promise<void>;
  /** Stops whatever runs, at once. */
  stop(): Promise<void>;
  disconnect(): Promise<void>;
  /** The link dropped (never after `disconnect`). */
  onLost(cb: (reason: string) => void): Unsubscribe;
  onConsole?(cb: (entry: ConsoleEntry) => void): Unsubscribe;
}

export const IDLE_STATUS: ConnectionStatus = {
  connection: 'disconnected',
  activity: 'idle',
  progress: null,
  error: null,
};
