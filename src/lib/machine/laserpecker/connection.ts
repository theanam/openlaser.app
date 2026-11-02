/**
 * LaserPecker behind the machine connection contract. Protocol details from the LaserPecker
 * protocol notes by nerdocs (https://github.com/nerdocs/pyrograph/blob/main/docs/protocol.md).
 * Implemented independently from that description; no code from pyrograph is included.
 */
import type { ConnectionStatus, MachineConnection, RunOutcome } from '../adapter';
import { IDLE_STATUS } from '../adapter';
import { Listeners, writable } from '../store';
import type { ConsoleEntry, Readable, Transport, Unsubscribe } from '../types';
import type { PreviewRect, PrintJob } from './commands';
import {
  LaserPeckerDriver,
  type LaserPeckerDriverOptions,
  type LaserPeckerState,
  type UploadFile,
} from './driver';
import { errorText, hex } from './replies';

/** One file and how to burn it. A job has one part per laser source. */
export interface LaserPeckerPart {
  file: UploadFile;
  settings: Omit<PrintJob, 'fileId'>;
}

/** What the LaserPecker encoder produces, plus the accessory the job needs switched on. */
export interface LaserPeckerJob {
  parts: LaserPeckerPart[];
  accessory: 'rotary' | 'slide' | null;
}

/** A rectangle on the work area (mm, top-left origin) and the resolution step to trace it at. */
export interface LaserPeckerFrame {
  rect: PreviewRect;
  px: number;
  /** mm, on a rotary. */
  objectDiameter?: number;
}

/** LaserPecker's serial bridge speed. */
export const LASERPECKER_BAUD = 460800;

function statusOf(s: LaserPeckerState): ConnectionStatus {
  const activity: ConnectionStatus['activity'] =
    s.activity === 'uploading'
      ? 'sending'
      : s.activity === 'engraving'
        ? 'running'
        : s.activity === 'paused' || s.activity === 'framing'
          ? s.activity
          : s.status?.mode === 'engraving' || s.status?.mode === 'framing'
            ? 'busy'
            : 'idle';
  const progress =
    s.activity === 'uploading'
      ? s.uploadTotal
        ? Math.round((s.uploaded / s.uploadTotal) * 100)
        : 0
      : s.activity === 'engraving' || s.activity === 'paused'
        ? s.progress
        : null;
  const code = s.status?.errorCode ?? 0;
  return { connection: s.connection, activity, progress, error: code ? errorText(code) : null };
}

export class LaserPeckerConnection implements MachineConnection<LaserPeckerJob, LaserPeckerFrame> {
  readonly capabilities = { frame: true, pause: true, console: true };
  readonly driver: LaserPeckerDriver;
  private readonly store = writable<ConnectionStatus>(IDLE_STATUS);
  readonly status = this.store;
  private readonly consoleEntries = new Listeners<ConsoleEntry>();
  private nextEntry = 1;
  private offs: Unsubscribe[] = [];

  constructor(options: LaserPeckerDriverOptions = {}) {
    this.driver = new LaserPeckerDriver(options);
    this.offs = [
      this.driver.state.subscribe((s) => this.store.set(statusOf(s))),
      this.driver.log.add((entry) =>
        this.consoleEntries.emit({
          id: this.nextEntry++,
          time: Date.now(),
          direction: entry.direction,
          kind: entry.matched ? 'command' : 'unknown',
          text: hex(entry.bytes),
        }),
      ),
    ];
  }

  static async open(
    transport: Transport,
    options: LaserPeckerDriverOptions & { baudRate?: number } = {},
  ): Promise<LaserPeckerConnection> {
    const connection = new LaserPeckerConnection(options);
    await connection.driver.connect(transport, options.baudRate ?? LASERPECKER_BAUD);
    return connection;
  }

  /** Version, model, upload and device status in full, for the LaserPecker panel. */
  get device(): Readable<LaserPeckerState> {
    return this.driver.state;
  }

  get canStop(): boolean {
    const s = this.driver.state.get();
    if (s.connection !== 'connected') return false;
    return s.activity !== 'idle' || s.status?.mode === 'engraving' || s.status?.mode === 'framing';
  }

  /** Traces the outline at the lowest power until `stop` (or `stopFrame`). */
  async frame(frame: LaserPeckerFrame): Promise<RunOutcome> {
    await this.driver.frame(frame.rect, frame.px, frame.objectDiameter ?? 0);
    return new Promise<RunOutcome>((resolve) => {
      const off = this.driver.state.subscribe((s) => {
        if (s.activity === 'framing') return;
        queueMicrotask(() => off());
        resolve(
          s.connection === 'connected' ? { outcome: 'aborted' } : { outcome: 'failed', reason: 'Link lost' },
        );
      });
    });
  }

  /** Ends a frame gently: the preview stops and the device settles. */
  stopFrame(): Promise<void> {
    return this.driver.stopFrame();
  }

  /**
   * Puts the accessory flag right, then burns the parts one after another, each laser in turn. A
   * part that is stopped or fails ends the job there.
   */
  async run(job: LaserPeckerJob): Promise<RunOutcome> {
    try {
      await this.driver.setAccessory(job.accessory);
    } catch (error) {
      return { outcome: 'failed', reason: error instanceof Error ? error.message : String(error) };
    }
    let outcome: RunOutcome = { outcome: 'completed' };
    for (const part of job.parts) {
      outcome = await this.driver.engrave(part.file, part.settings);
      if (outcome.outcome !== 'completed') break;
    }
    return outcome;
  }

  pause(): Promise<void> {
    return this.driver.pause();
  }

  resume(): Promise<void> {
    return this.driver.resume();
  }

  stop(): Promise<void> {
    return this.driver.stop();
  }

  async disconnect(): Promise<void> {
    for (const off of this.offs) off();
    this.offs = [];
    await this.driver.disconnect();
    this.store.set(IDLE_STATUS);
  }

  onLost(cb: (reason: string) => void): Unsubscribe {
    return this.driver.lost.add(cb);
  }

  onConsole(cb: (entry: ConsoleEntry) => void): Unsubscribe {
    return this.consoleEntries.add(cb);
  }
}
