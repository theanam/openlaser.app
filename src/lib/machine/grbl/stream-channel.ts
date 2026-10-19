import type { MachineState, Readable, RealtimeCommand, Unsubscribe } from '../types';
import type { LineResponse } from './line-accounting';

/**
 * Who caused a reset: the stream owner itself (`stream`, e.g. job stop), the user through the
 * driver (`user`), or the controller on its own (`unexpected`, e.g. a brown-out or USB glitch).
 */
export type ResetCause = 'stream' | 'user' | 'unexpected';

/**
 * Exclusive low-level access to the driver's write path, used only by the JobRunner. While a
 * channel is held, manual `sendCommand` calls are rejected so nothing interleaves with a job.
 */
export interface StreamChannel {
  readonly rxSize: number;
  readonly inFlightBytes: number;
  readonly state: Readable<MachineState>;
  /** True if the line fits the RX buffer now and writes are not gated by a pending reset. */
  canWrite(line: string): boolean;
  /** Writes the line immediately; call only after `canWrite`. `onResponse` fires once per line. */
  writeLine(line: string, onResponse: (response: LineResponse) => void): Promise<void>;
  realtime(cmd: RealtimeCommand): void;
  /** Soft reset; resolves after the welcome message (or the reset timeout). */
  softReset(): Promise<void>;
  /** Fired when buffer space was freed or writes were un-gated: try to send more. */
  onWritable(cb: () => void): Unsubscribe;
  /** Fired after each status report has been merged into the state. */
  onStatusReport(cb: (state: MachineState) => void): Unsubscribe;
  onAlarm(cb: (alarm: { code: number; message: string }) => void): Unsubscribe;
  onReset(cb: (cause: ResetCause) => void): Unsubscribe;
  onDisconnect(cb: (reason: string) => void): Unsubscribe;
  /** Gives the write path back to manual commands. Safe to call twice. */
  release(): void;
}
