/**
 * Machine layer contracts (SPEC §7). This layer knows nothing about projects or CAM: it takes
 * G-code lines and exposes machine state and events. Transports only move bytes.
 */
import type { Vec2, Vec3 } from '../geometry/types';
import type { MachineProfile } from '../project/types';

export type Unsubscribe = () => void;

/** Svelte-store compatible readable, without depending on Svelte. */
export interface Readable<T> {
  subscribe(run: (value: T) => void): Unsubscribe;
  get(): T;
}

export type TransportKind = 'webserial' | 'simulator' | 'websocket';

export interface Transport {
  readonly kind: TransportKind;
  readonly connected: boolean;
  /** Human-readable port description, e.g. "USB 1a86:7523". */
  readonly label?: string;
  open(options: { baudRate: number }): Promise<void>;
  /** Safe to call twice. */
  close(): Promise<void>;
  write(data: Uint8Array): Promise<void>;
  onData(cb: (chunk: Uint8Array) => void): Unsubscribe;
  onDisconnect(cb: (reason: string) => void): Unsubscribe;
}

export type MachineStatus =
  'Idle' | 'Run' | 'Hold' | 'Jog' | 'Alarm' | 'Door' | 'Check' | 'Home' | 'Sleep' | 'Unknown';

export type FirmwareName = 'grbl' | 'grblHAL' | 'fluidnc' | 'unknown';

export interface MachineState {
  connection: 'disconnected' | 'connecting' | 'connected';
  firmware: { name: FirmwareName; version: string } | null;
  status: MachineStatus;
  /** Hold:0/1, Door:0-3 */
  subState: number | null;
  mpos: Vec3 | null;
  wpos: Vec3 | null;
  wco: Vec3 | null;
  feed: number;
  /** Current S. */
  spindle: number;
  overrides: { feed: number; rapid: number; spindle: number };
  buffer: { plannerFree: number; rxFree: number } | null;
  alarm: { code: number; message: string } | null;
  lastError: { code: number; message: string; line?: string } | null;
  settings: Record<number, string>;
  homed: boolean;
}

export type RealtimeCommand =
  | 'status'
  | 'cycle-start'
  | 'feed-hold'
  | 'soft-reset'
  | 'safety-door'
  | 'jog-cancel'
  | 'feed-100'
  | 'feed+10'
  | 'feed-10'
  | 'feed+1'
  | 'feed-1'
  | 'rapid-100'
  | 'rapid-50'
  | 'rapid-25'
  | 'spindle-100'
  | 'spindle+10'
  | 'spindle-10'
  | 'spindle+1'
  | 'spindle-1'
  | 'spindle-stop'
  | 'flood-toggle';

export type CommandResult = { ok: true } | { ok: false; code: number; message: string };

export interface HandshakeResult {
  firmware: { name: FirmwareName; version: string };
  /** RX buffer size used for character counting. */
  rxSize: number;
  settings: Record<number, string>;
  /** $32 is not 1: offer "Enable laser mode ($32=1)". */
  laserModeOff: boolean;
  /** $130/$131 differ significantly from the profile bed size. */
  bedSizeMismatch: { width: number; height: number } | null;
}

export type ConsoleDirection = 'sent' | 'received' | 'info';
export type ConsoleKind =
  | 'command'
  | 'ok'
  | 'error'
  | 'alarm'
  | 'status'
  | 'welcome'
  | 'feedback'
  | 'setting'
  | 'unknown'
  | 'realtime'
  | 'info';

export interface ConsoleEntry {
  id: number;
  /** ms since epoch (UI clock). */
  time: number;
  direction: ConsoleDirection;
  kind: ConsoleKind;
  text: string;
}

export interface MachineDriver {
  readonly state: Readable<MachineState>;
  connect(transport: Transport, profile: MachineProfile): Promise<HandshakeResult>;
  disconnect(): Promise<void>;
  /** Queued; resolves on ok/error. Rejects with ResetError after a soft reset. */
  sendCommand(line: string): Promise<CommandResult>;
  /** Bypasses the queue. */
  realtime(cmd: RealtimeCommand): void;
  jog(delta: Partial<Vec3>, feed: number): Promise<void>;
  cancelJog(): void;
  home(): Promise<void>;
  unlock(): Promise<void>;
  readSettings(): Promise<Record<number, string>>;
  writeSetting(n: number, value: string): Promise<void>;
  onConsole(cb: (entry: ConsoleEntry) => void): Unsubscribe;
}

export type ErrorPolicy = 'stop' | 'continue';

export type JobPhase =
  'idle' | 'running' | 'paused' | 'error-hold' | 'stopping' | 'completed' | 'aborted' | 'failed';

export interface JobProgress {
  phase: JobPhase;
  /** 'job' or 'frame' (framing runs through the same runner). */
  kind: 'job' | 'frame';
  total: number;
  sent: number;
  acked: number;
  elapsedMs: number;
  /** Blended from the CAM estimate and the observed rate. Null until known. */
  remainingMs: number | null;
  /** Set while phase is 'error-hold' or after a failure. */
  error: { code: number; message: string; line: string; lineIndex: number } | null;
  failureReason: string | null;
}

export type JobEvent =
  | { type: 'started'; total: number; kind: 'job' | 'frame' }
  | { type: 'progress'; progress: JobProgress }
  | { type: 'paused' }
  | { type: 'resumed' }
  | { type: 'line-error'; code: number; message: string; line: string; lineIndex: number }
  | { type: 'completed'; elapsedMs: number }
  | { type: 'aborted' }
  | { type: 'failed'; reason: string };

export interface JobRunOptions {
  kind?: 'job' | 'frame';
  errorPolicy?: ErrorPolicy;
  /** CAM estimate, used to blend the remaining time. */
  estimatedSeconds?: number;
}

export type JobOutcome = 'completed' | 'aborted' | 'failed';

/** Streams G-code with GRBL character counting (SPEC §7.3). */
export interface JobRunnerApi {
  readonly progress: Readable<JobProgress>;
  readonly active: boolean;
  run(lines: string[], options?: JobRunOptions): Promise<JobOutcome>;
  /** Feed hold. */
  pause(): void;
  /** Cycle start. */
  resume(): void;
  /** Feed hold, wait for Hold:0 or 500 ms, soft reset, then M5 after the welcome. */
  stop(): Promise<void>;
  /** With the 'stop' error policy: continue streaming after a line error. */
  continueAfterError(): void;
  onEvent(cb: (event: JobEvent) => void): Unsubscribe;
}

export type { Vec2, Vec3 };
