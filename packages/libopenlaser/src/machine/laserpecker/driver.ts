/**
 * LaserPecker driver: connects, polls status once a second, frames, uploads a job file, starts,
 * pauses and stops it. Protocol details from the LaserPecker protocol notes by nerdocs
 * (https://github.com/nerdocs/pyrograph/blob/main/docs/protocol.md). Implemented independently
 * from that description; no code from pyrograph is included.
 *
 * Nothing here starts a job on its own: `engrave` runs only when called, and a dropped link ends
 * the job as failed without retrying.
 */
import { HandshakeError } from '../errors';
import { realScheduler, type Scheduler } from '../scheduler';
import { Listeners, writable, type Writable } from '../store';
import type { Readable, Transport, Unsubscribe } from '../types';
import {
  Func,
  Query,
  PrintState,
  announceFileCommand,
  exitCommand,
  previewRectCommand,
  previewStopCommand,
  printControlCommand,
  printStartCommand,
  queryCommand,
  accessoryInSettings,
  settingsWithAccessory,
  type PreviewRect,
  type PrintJob,
} from './commands';
import { BLE_CHUNK_BYTES, BLE_CHUNK_GAP_MS } from '../transport/web-bluetooth';
import { LaserPeckerLink, ReplyTimeoutError, type LinkLog } from './link';
import { modelFromVersion, type ModelInfo } from './models';
import {
  errorText,
  jobFinished,
  parseFileIds,
  parseFileReply,
  parseStatus,
  parseVersion,
  type DeviceStatus,
  type DeviceVersion,
} from './replies';

export type LaserPeckerActivity = 'idle' | 'framing' | 'uploading' | 'engraving' | 'paused';

export interface LaserPeckerState {
  connection: 'disconnected' | 'connecting' | 'connected';
  version: DeviceVersion | null;
  model: ModelInfo | null;
  status: DeviceStatus | null;
  activity: LaserPeckerActivity;
  /** Bytes of the file sent so far, while uploading. */
  uploaded: number;
  uploadTotal: number;
  /** Percent of the running job, from the device. */
  progress: number;
}

/** A job file ready to send: the 64-byte header followed by the image. */
export interface UploadFile {
  id: number;
  data: Uint8Array;
}

export type EngraveResult =
  { outcome: 'completed' } | { outcome: 'aborted' } | { outcome: 'failed'; reason: string };

export class UploadRefusedError extends Error {
  override name = 'UploadRefusedError';
  constructor() {
    super('The laser refuses uploads. Switch it off and on again.');
  }
}

export interface LaserPeckerDriverOptions {
  scheduler?: Scheduler;
  pollMs?: number;
  replyTimeoutMs?: number;
  /** Polls in a row without a reply before the link counts as lost. */
  maxMissedPolls?: number;
  /** How long to wait for the device to accept or store an upload. */
  uploadReplyMs?: number;
  /** Upload pacing for serial links; BLE paces itself in the transport. */
  serialChunkBytes?: number;
  serialChunkGapMs?: number;
  /** The device needs about a second to settle after a preview stops. */
  settleMs?: number;
  /** A job that never reports running counts as done after this long idle. */
  startGraceMs?: number;
}

const IDLE: LaserPeckerState = {
  connection: 'disconnected',
  version: null,
  model: null,
  status: null,
  activity: 'idle',
  uploaded: 0,
  uploadTotal: 0,
  progress: 0,
};

const SETTINGS_UNREADABLE =
  'Could not read the laser’s settings to switch the accessory. Switch it in the LaserPecker app.';

export class LaserPeckerDriver {
  private readonly store: Writable<LaserPeckerState> = writable(IDLE);
  readonly state: Readable<LaserPeckerState> = this.store;
  readonly log = new Listeners<LinkLog>();
  /** The link dropped or stopped answering (never after `disconnect`). */
  readonly lost = new Listeners<string>();
  private link: LaserPeckerLink | null = null;
  private subscriptions: Unsubscribe[] = [];
  private pollTimer: number | null = null;
  private missed = 0;
  private aborted = false;
  private finishJob: ((result: EngraveResult) => void) | null = null;
  private jobStartedAt = 0;
  private seenRunning = false;
  /** Length byte of the device's status replies, to tell them from other query replies. */
  private statusLength = -1;
  private readonly scheduler: Scheduler;
  private readonly o: Required<Omit<LaserPeckerDriverOptions, 'scheduler'>>;

  constructor(options: LaserPeckerDriverOptions = {}) {
    this.scheduler = options.scheduler ?? realScheduler;
    this.o = {
      pollMs: options.pollMs ?? 1000,
      replyTimeoutMs: options.replyTimeoutMs ?? 2000,
      maxMissedPolls: options.maxMissedPolls ?? 5,
      uploadReplyMs: options.uploadReplyMs ?? 60_000,
      serialChunkBytes: options.serialChunkBytes ?? 2048,
      serialChunkGapMs: options.serialChunkGapMs ?? 50,
      settleMs: options.settleMs ?? 1000,
      startGraceMs: options.startGraceMs ?? 10_000,
    };
  }

  private patch(p: Partial<LaserPeckerState>): void {
    this.store.update((s) => ({ ...s, ...p }));
  }

  get connected(): boolean {
    return this.store.get().connection === 'connected';
  }

  async connect(transport: Transport, baudRate: number): Promise<LaserPeckerState> {
    this.patch({ connection: 'connecting' });
    try {
      if (!transport.connected) await transport.open({ baudRate });
      const link = new LaserPeckerLink(transport, this.scheduler);
      this.link = link;
      this.subscriptions = [
        link.log.add((entry) => this.log.emit(entry)),
        transport.onDisconnect((reason) => this.lose(reason)),
      ];
      const versionReply = await link
        .request(queryCommand(Query.version), (f) => f.func === Func.query, this.o.replyTimeoutMs + 1000)
        .catch(() => null);
      const version = versionReply ? parseVersion(versionReply.bytes) : null;
      if (!version)
        throw new HandshakeError(
          'No reply from the laser. Check that it is on and not in use by another app.',
        );
      this.patch({ connection: 'connected', version, model: modelFromVersion(version.software) });
      await this.poll();
      return this.store.get();
    } catch (error) {
      await this.teardown();
      throw error;
    }
  }

  async disconnect(): Promise<void> {
    await this.teardown();
  }

  /** Traces a rectangle at the lowest power until `stopFrame` or Stop; on a rotary, as it turns. */
  async frame(rect: PreviewRect, px: number, objectDiameter = 0): Promise<void> {
    const link = this.requireIdle();
    await link.write(previewRectCommand(rect, px, objectDiameter));
    this.patch({ activity: 'framing' });
  }

  async stopFrame(): Promise<void> {
    if (!this.link || this.store.get().activity !== 'framing') return;
    await this.link.write(previewStopCommand());
    await this.sleep(this.o.settleMs);
    if (this.store.get().activity === 'framing') this.patch({ activity: 'idle' });
  }

  /**
   * Turns the rotary or slide flag on (or both off) in the device settings, when it differs from
   * what the device reports. Every other setting is written back as read.
   */
  async setAccessory(accessory: 'rotary' | 'slide' | null): Promise<void> {
    const link = this.requireIdle();
    // A settings reply never has the status reply's length; anything that does is a stray status
    // frame, and writing it back as settings would scramble the device's settings.
    const read = await link
      .request(
        queryCommand(Query.settings),
        (f) => f.func === Func.query && f.bytes[2] !== this.statusLength,
        this.o.replyTimeoutMs,
      )
      .catch((e: unknown) => {
        if (e instanceof ReplyTimeoutError) return null;
        throw e;
      });
    if (!read || read.bytes.length < 19) {
      // Unreadable: a flat-bed job leaves the settings alone; an accessory job cannot switch it.
      if (accessory === null) return;
      throw new Error(SETTINGS_UNREADABLE);
    }
    if (accessoryInSettings(read.bytes) === accessory) return;
    // The device's answer to a settings write is not documented: wait briefly for any reply.
    await link
      .request(
        settingsWithAccessory(read.bytes, accessory),
        (f) => f.func === Func.settings,
        this.o.replyTimeoutMs,
      )
      .catch((e: unknown) => {
        if (!(e instanceof ReplyTimeoutError)) throw e;
      });
  }

  /**
   * Uploads the file (unless the device already holds this exact one) and starts it. Resolves
   * when the job ends, is stopped, or fails.
   */
  async engrave(file: UploadFile, job: Omit<PrintJob, 'fileId'>): Promise<EngraveResult> {
    const link = this.requireIdle();
    this.aborted = false;
    try {
      if (!(await this.holdsFile(file.id))) {
        await this.upload(link, file);
        // Straight after an upload an LP4 started with the previous job's laser; a rerun of the
        // stored file used the right one. Give it a moment, as after a preview.
        await this.sleep(this.o.settleMs);
      }
    } catch (error) {
      this.patch({ activity: 'idle', uploaded: 0, uploadTotal: 0 });
      this.schedulePoll();
      if (this.aborted) return { outcome: 'aborted' };
      return { outcome: 'failed', reason: error instanceof Error ? error.message : String(error) };
    }
    if (this.aborted) return { outcome: 'aborted' };
    const done = new Promise<EngraveResult>((resolve) => (this.finishJob = resolve));
    this.jobStartedAt = this.scheduler.now();
    this.seenRunning = false;
    this.patch({ activity: 'engraving', progress: 0, uploaded: 0, uploadTotal: 0 });
    await link.write(printStartCommand({ ...job, fileId: file.id }));
    this.schedulePoll();
    return done;
  }

  async pause(): Promise<void> {
    if (!this.link || this.store.get().activity !== 'engraving') return;
    await this.link.write(printControlCommand(PrintState.pause));
    this.patch({ activity: 'paused' });
  }

  async resume(): Promise<void> {
    if (!this.link || this.store.get().activity !== 'paused') return;
    await this.link.write(printControlCommand(PrintState.resume));
    this.patch({ activity: 'engraving' });
  }

  /** Stops whatever runs: an upload, a job or a frame. Never waits for a reply. */
  async stop(): Promise<void> {
    const link = this.link;
    if (!link) return;
    this.aborted = true;
    const wasFraming = this.store.get().activity === 'framing';
    this.endJob({ outcome: 'aborted' });
    await link.write(printControlCommand(PrintState.stop)).catch(() => undefined);
    await link.write(previewStopCommand()).catch(() => undefined);
    await link.write(exitCommand()).catch(() => undefined);
    if (wasFraming) await this.sleep(this.o.settleMs);
    if (this.store.get().activity !== 'uploading') this.patch({ activity: 'idle', progress: 0 });
  }

  private requireIdle(): LaserPeckerLink {
    if (!this.link || !this.connected) throw new Error('The laser is not connected.');
    if (this.store.get().activity !== 'idle') throw new Error('The laser is busy.');
    return this.link;
  }

  private async holdsFile(id: number): Promise<boolean> {
    const reply = await this.link
      ?.request(queryCommand(Query.fileIds), (f) => f.func === Func.query, this.o.replyTimeoutMs)
      .catch(() => null);
    return reply ? (parseFileIds(reply.bytes)?.includes(id) ?? false) : false;
  }

  private async upload(link: LaserPeckerLink, file: UploadFile): Promise<void> {
    this.stopPolling();
    this.patch({ activity: 'uploading', uploaded: 0, uploadTotal: file.data.length });
    await link
      .request(exitCommand(), () => true, this.o.replyTimeoutMs)
      .catch((e: unknown) => {
        if (!(e instanceof ReplyTimeoutError)) throw e;
      });
    const fileReply = (f: { func: number }) => f.func === Func.file || f.func === Func.exit;
    const answer = await link.request(announceFileCommand(file.data.length), fileReply, this.o.uploadReplyMs);
    const kind = parseFileReply(answer.bytes).kind;
    if (kind === 'refused') throw new UploadRefusedError();
    if (kind !== 'ready') throw new Error('The laser did not accept the upload.');
    const ble = link.transport.kind === 'webbluetooth';
    const chunk = ble ? BLE_CHUNK_BYTES : this.o.serialChunkBytes;
    // The device answers once the whole file is in, so the wait includes the transfer: about
    // 1.8 KB/s over Bluetooth, given twice that for a slow link.
    const transferMs =
      Math.ceil(file.data.length / chunk) * (ble ? BLE_CHUNK_GAP_MS : this.o.serialChunkGapMs);
    const stored = link.expect(
      (f) => parseFileReply(f.bytes).kind === 'stored',
      2 * transferMs + this.o.uploadReplyMs,
    );
    stored.catch(() => undefined);
    for (let at = 0; at < file.data.length; at += chunk) {
      if (this.aborted) throw new Error('Upload stopped.');
      await link.write(file.data.subarray(at, at + chunk), false);
      this.patch({ uploaded: Math.min(file.data.length, at + chunk) });
      if (!ble) await this.sleep(this.o.serialChunkGapMs);
    }
    await stored;
  }

  private schedulePoll(): void {
    this.stopPolling();
    if (!this.connected || this.store.get().activity === 'uploading') return;
    this.pollTimer = this.scheduler.setTimeout(() => {
      this.pollTimer = null;
      void this.poll();
    }, this.o.pollMs);
  }

  private stopPolling(): void {
    if (this.pollTimer !== null) this.scheduler.clearTimeout(this.pollTimer);
    this.pollTimer = null;
  }

  private async poll(): Promise<void> {
    const link = this.link;
    if (!link || this.store.get().activity === 'uploading') return;
    const reply = await link
      .request(
        queryCommand(Query.status),
        (f) => f.func === Func.query && f.bytes.length >= 17,
        this.o.replyTimeoutMs,
      )
      .catch(() => null);
    if (link !== this.link) return;
    if (reply) {
      this.missed = 0;
      const status = parseStatus(reply.bytes);
      if (status) this.onStatus(status, reply.bytes);
    } else if (++this.missed >= this.o.maxMissedPolls) {
      this.lose('No reply from the laser.');
      return;
    }
    if (this.pollTimer === null) this.schedulePoll();
  }

  private onStatus(status: DeviceStatus, bytes: Uint8Array): void {
    this.statusLength = bytes[2];
    const s = this.store.get();
    this.patch({ status, progress: s.activity === 'engraving' ? status.progress : s.progress });
    if (s.activity !== 'engraving') return;
    if (status.mode === 'engraving') this.seenRunning = true;
    if (status.mode === 'error') {
      this.endJob({ outcome: 'failed', reason: errorText(status.errorCode) });
      this.patch({ activity: 'idle' });
    } else if (
      jobFinished(status) &&
      (this.seenRunning || this.scheduler.now() - this.jobStartedAt > this.o.startGraceMs)
    ) {
      this.endJob({ outcome: 'completed' });
      this.patch({ activity: 'idle', progress: 100 });
    }
  }

  private endJob(result: EngraveResult): void {
    const finish = this.finishJob;
    this.finishJob = null;
    finish?.(result);
  }

  private lose(reason: string): void {
    if (!this.link) return;
    this.endJob({ outcome: 'failed', reason });
    void this.teardown();
    this.lost.emit(reason);
  }

  private async teardown(): Promise<void> {
    this.stopPolling();
    for (const off of this.subscriptions) off();
    this.subscriptions = [];
    const link = this.link;
    this.link = null;
    this.missed = 0;
    link?.dispose();
    this.store.set(IDLE);
    await link?.transport.close().catch(() => undefined);
  }

  private sleep(ms: number): Promise<void> {
    return new Promise((resolve) => this.scheduler.setTimeout(resolve, ms));
  }
}
