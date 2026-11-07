import type { MachineProfile } from '../../project/types';
import { ConsoleLog } from '../console-log';
import { DisconnectedError, ResetError } from '../errors';
import { realScheduler, type Scheduler, type TimerHandle } from '../scheduler';
import { Listeners, writable } from '../store';
import type {
  CommandResult,
  ConsoleEntry,
  MachineState,
  Readable,
  RealtimeCommand,
  Transport,
  Unsubscribe,
} from '../types';
import { CRITICAL_ALARMS, alarmMessage, errorMessage } from './error-codes';
import { DEFAULT_RX_SIZE } from './handshake';
import { spindleCommandIn } from './laser-safety';
import {
  LineAccounting,
  isSendableText,
  wireLength,
  type InFlightLine,
  type LineResponse,
} from './line-accounting';
import { classifyLine, type GrblLine } from './line-classifier';
import { encodeAscii, LineSplitter } from './line-splitter';
import { applyStatusReport, initialMachineState } from './machine-state';
import { REALTIME_BYTES } from './realtime';
import { parseStatusReport } from './status-report';
import type { ResetCause, StreamChannel } from './stream-channel';
import type { GrblDriverOptions } from './driver-options';
import { interpretFeedback } from './feedback';

interface QueuedCommand {
  line: string;
  resolve(result: CommandResult): void;
  reject(error: Error): void;
}

/**
 * The GRBL wire protocol: response parsing, the shared character-counting FIFO, the manual
 * command queue, soft reset gating and status polling. GrblDriver builds the public API on top.
 */
export abstract class GrblProtocol {
  readonly console: ConsoleLog;
  protected readonly store = writable<MachineState>(initialMachineState());
  readonly state: Readable<MachineState> = {
    subscribe: (run) => this.store.subscribe(run),
    get: () => this.store.get(),
  };

  protected readonly scheduler: Scheduler;
  protected readonly welcomeTimeoutMs: number;
  private readonly statusPollMs: number;
  private readonly jobStatusPollMs: number;
  private readonly resetTimeoutMs: number;

  protected transport: Transport | null = null;
  protected profile: MachineProfile | null = null;
  protected readonly accounting = new LineAccounting(DEFAULT_RX_SIZE);
  protected handshakeDone = false;
  protected needsResetToUnlock = false;
  /** Set when a line with M3/M4 was sent and no M5 since, so jogging can force the laser off. */
  protected laserMaybeOn = false;
  protected stream: StreamChannel | null = null;
  /** Writes are gated between a soft reset and the controller's welcome message. */
  protected awaitingWelcome = false;

  protected readonly writableListeners = new Listeners<void>();
  protected readonly alarmListeners = new Listeners<{ code: number; message: string }>();
  protected readonly resetListeners = new Listeners<ResetCause>();
  protected readonly disconnectListeners = new Listeners<string>();
  protected readonly statusListeners = new Listeners<MachineState>();

  private transportSubscriptions: Unsubscribe[] = [];
  private readonly splitter = new LineSplitter();
  private commandQueue: QueuedCommand[] = [];
  private pollTimer: TimerHandle | null = null;
  private welcomeWaiters: (() => void)[] = [];
  private welcomeSeen = false;
  private resetTimer: TimerHandle | null = null;

  constructor(options: GrblDriverOptions = {}) {
    this.scheduler = options.scheduler ?? realScheduler;
    this.statusPollMs = options.statusPollMs ?? 200;
    this.jobStatusPollMs = options.jobStatusPollMs ?? 100;
    this.welcomeTimeoutMs = options.welcomeTimeoutMs ?? 2500;
    this.resetTimeoutMs = options.resetTimeoutMs ?? 2500;
    this.console = new ConsoleLog(options.wallClock ?? Date.now, options.consoleCapacity);
  }

  get rxSize(): number {
    return this.accounting.rxSize;
  }

  onConsole(cb: (entry: ConsoleEntry) => void): Unsubscribe {
    return this.console.onEntry(cb);
  }

  // ---- transport lifecycle ------------------------------------------------------------------

  protected attachTransport(transport: Transport): void {
    this.transport = transport;
    this.accounting.rxSize = DEFAULT_RX_SIZE;
    this.transportSubscriptions = [
      transport.onData((chunk) => this.handleData(chunk)),
      transport.onDisconnect((reason) => {
        if (this.transport === transport) void this.teardown(`Connection lost: ${reason}`);
      }),
    ];
  }

  /** Drops the connection: everything pending is rejected and nothing is replayed later. */
  protected async teardown(reason: string): Promise<void> {
    const transport = this.transport;
    if (!transport) return;
    this.transport = null;
    this.handshakeDone = false;
    for (const unsubscribe of this.transportSubscriptions) unsubscribe();
    this.transportSubscriptions = [];
    this.cancelPoll();
    this.clearResetGate();
    const error = new DisconnectedError(reason);
    for (const entry of this.accounting.drain()) entry.discard(error);
    this.rejectQueuedCommands(error);
    this.splitter.reset();
    this.welcomeSeen = false;
    this.laserMaybeOn = false;
    this.needsResetToUnlock = false;
    this.info(reason);
    this.disconnectListeners.emit(reason);
    this.store.set({ ...initialMachineState(), settings: this.store.get().settings });
    this.wakeWelcomeWaiters();
    await transport.close().catch(() => undefined);
  }

  // ---- writing ------------------------------------------------------------------------------

  protected enqueueCommand(rawLine: string): Promise<CommandResult> {
    const line = rawLine.trim();
    if (!isSendableText(line))
      return Promise.reject(new RangeError('Commands must be printable ASCII on a single line'));
    if (wireLength(line) > this.accounting.rxSize - 1) {
      return Promise.reject(
        new RangeError(`Command is longer than the controller buffer (${this.accounting.rxSize - 1} bytes)`),
      );
    }
    return new Promise<CommandResult>((resolve, reject) => {
      this.commandQueue.push({ line, resolve, reject });
      this.pumpCommands();
    });
  }

  protected pumpCommands(): void {
    while (this.commandQueue.length > 0 && !this.awaitingWelcome && this.transport) {
      const next = this.commandQueue[0];
      if (!this.accounting.fits(wireLength(next.line))) return;
      this.commandQueue.shift();
      this.writeLine(next.line, {
        line: next.line,
        byteLength: wireLength(next.line),
        settle: (response) => next.resolve(response),
        discard: (reason) => next.reject(reason),
      }).catch(() => undefined);
    }
  }

  private rejectQueuedCommands(error: Error): void {
    const queued = this.commandQueue;
    this.commandQueue = [];
    for (const command of queued) command.reject(error);
  }

  /** Counted write: the line enters the in-flight FIFO before its bytes go out. */
  protected async writeLine(line: string, entry: InFlightLine): Promise<void> {
    this.accounting.push(entry);
    const spindle = spindleCommandIn(line);
    if (spindle) this.laserMaybeOn = spindle !== 'M5';
    this.console.add('sent', 'command', line);
    await this.writeBytes(encodeAscii(`${line}\n`));
  }

  protected async writeBytes(bytes: Uint8Array): Promise<void> {
    const transport = this.transport;
    if (!transport) throw new DisconnectedError();
    try {
      await transport.write(bytes);
    } catch (error) {
      const reason = `Write failed: ${error instanceof Error ? error.message : String(error)}`;
      if (this.transport === transport) await this.teardown(reason);
      throw new DisconnectedError(reason);
    }
  }

  realtime(cmd: RealtimeCommand): void {
    if (!this.transport) return;
    if (cmd === 'soft-reset') {
      void this.softReset();
      return;
    }
    if (cmd !== 'status') this.console.add('sent', 'realtime', `[${cmd}]`);
    this.writeBytes(Uint8Array.of(REALTIME_BYTES[cmd])).catch(() => undefined);
  }

  /**
   * Soft reset (0x18): discards the queue and in-flight lines (pending promises reject with
   * ResetError), then gates writes until the welcome message. Nothing is ever replayed.
   */
  softReset(cause: ResetCause = 'user'): Promise<void> {
    if (!this.transport) return Promise.resolve();
    this.console.add('sent', 'realtime', '[soft-reset]');
    const written = this.writeBytes(Uint8Array.of(REALTIME_BYTES['soft-reset'])).catch(() => undefined);
    this.discardForReset(cause);
    this.awaitingWelcome = true;
    if (this.resetTimer !== null) this.scheduler.clearTimeout(this.resetTimer);
    this.resetTimer = this.scheduler.setTimeout(() => {
      this.resetTimer = null;
      if (!this.awaitingWelcome) return;
      this.info('No welcome message after reset; continuing');
      this.clearResetGate();
    }, this.resetTimeoutMs);
    return written.then(() =>
      this.awaitingWelcome ? new Promise<void>((resolve) => this.welcomeWaiters.push(resolve)) : undefined,
    );
  }

  private discardForReset(cause: ResetCause): void {
    const error = new ResetError();
    for (const entry of this.accounting.drain()) entry.discard(error);
    this.rejectQueuedCommands(error);
    this.laserMaybeOn = false;
    this.needsResetToUnlock = false;
    this.patch({ overrides: { feed: 100, rapid: 100, spindle: 100 } });
    this.resetListeners.emit(cause);
  }

  private clearResetGate(): void {
    if (this.resetTimer !== null) this.scheduler.clearTimeout(this.resetTimer);
    this.resetTimer = null;
    if (!this.awaitingWelcome) return;
    this.awaitingWelcome = false;
    this.wakeWelcomeWaiters();
    this.pumpCommands();
    this.writableListeners.emit();
  }

  // ---- receiving ----------------------------------------------------------------------------

  private handleData(chunk: Uint8Array): void {
    for (const raw of this.splitter.push(chunk)) this.handleLine(classifyLine(raw), raw);
  }

  private handleLine(line: GrblLine, raw: string): void {
    switch (line.type) {
      case 'empty':
        return;
      case 'ok':
        this.console.add('received', 'ok', 'ok');
        this.settleNext({ ok: true });
        return;
      case 'error': {
        const message = errorMessage(line.code);
        this.console.add('received', 'error', `${line.text} (${message})`);
        const entry = this.settleNext({ ok: false, code: line.code, message });
        this.patch({ lastError: { code: line.code, message, line: entry?.line } });
        return;
      }
      case 'alarm': {
        const alarm = { code: line.code, message: alarmMessage(line.code) };
        this.console.add('received', 'alarm', `${line.text} (${alarm.message})`);
        // A soft limit alarm keeps the machine position; every other alarm loses it.
        this.patch({
          status: 'Alarm',
          subState: null,
          alarm,
          homed: line.code === 2 && this.store.get().homed,
        });
        if (CRITICAL_ALARMS.has(line.code)) this.needsResetToUnlock = true;
        this.alarmListeners.emit(alarm);
        return;
      }
      case 'status':
        this.console.add('received', 'status', raw.trim());
        this.store.set(applyStatusReport(this.store.get(), parseStatusReport(line.body)));
        this.statusListeners.emit(this.store.get());
        return;
      case 'welcome':
        this.console.add('received', 'welcome', line.text);
        this.patch({ firmware: { name: line.firmware, version: line.version } });
        this.handleWelcome();
        return;
      case 'feedback':
        this.console.add('received', 'feedback', `[${line.tag}:${line.content}]`);
        this.handleFeedback(line.tag, line.content);
        return;
      case 'setting':
        this.console.add('received', 'setting', `$${line.n}=${line.value}`);
        this.patch({ settings: { ...this.store.get().settings, [line.n]: line.value } });
        return;
      case 'unknown':
        this.console.add('received', 'unknown', line.text);
        return;
    }
  }

  private settleNext(response: LineResponse): InFlightLine | undefined {
    const entry = this.accounting.shift();
    if (!entry) {
      this.info('Response without a pending command (ignored)');
      return undefined;
    }
    entry.settle(response);
    this.pumpCommands();
    this.writableListeners.emit();
    return entry;
  }

  private handleWelcome(): void {
    this.welcomeSeen = true;
    if (this.awaitingWelcome) {
      this.clearResetGate();
      return;
    }
    this.wakeWelcomeWaiters();
    if (this.handshakeDone || this.accounting.inFlightCount > 0 || this.commandQueue.length > 0) {
      // The controller reset by itself; whatever was in flight is gone and must not be resent.
      this.info('Controller reset unexpectedly');
      this.discardForReset('unexpected');
    }
  }

  private handleFeedback(tag: string, content: string): void {
    const effect = interpretFeedback(tag, content, this.store.get().firmware);
    if (effect.firmware) this.patch({ firmware: effect.firmware });
    if (effect.rxSize) this.accounting.rxSize = effect.rxSize;
    if (effect.needsResetToUnlock) this.needsResetToUnlock = true;
  }

  /** Resolves true on a welcome message (including one already received), false on timeout. */
  protected waitForWelcome(timeoutMs: number): Promise<boolean> {
    if (this.welcomeSeen) {
      this.welcomeSeen = false;
      return Promise.resolve(true);
    }
    return new Promise<boolean>((resolve) => {
      const onWelcome = () => {
        this.scheduler.clearTimeout(timer);
        this.welcomeSeen = false;
        resolve(this.transport !== null);
      };
      const timer = this.scheduler.setTimeout(() => {
        this.welcomeWaiters = this.welcomeWaiters.filter((w) => w !== onWelcome);
        resolve(false);
      }, timeoutMs);
      this.welcomeWaiters.push(onWelcome);
    });
  }

  private wakeWelcomeWaiters(): void {
    const waiters = this.welcomeWaiters;
    this.welcomeWaiters = [];
    for (const wake of waiters) wake();
  }

  // ---- status polling -----------------------------------------------------------------------

  /** (Re)starts the `?` poll at the rate for the current mode (job or idle). */
  protected schedulePoll(): void {
    this.cancelPoll();
    if (!this.transport || !this.handshakeDone) return;
    const interval = this.stream ? this.jobStatusPollMs : this.statusPollMs;
    this.pollTimer = this.scheduler.setTimeout(() => {
      this.pollTimer = null;
      if (!this.awaitingWelcome) this.realtime('status');
      this.schedulePoll();
    }, interval);
  }

  private cancelPoll(): void {
    if (this.pollTimer !== null) this.scheduler.clearTimeout(this.pollTimer);
    this.pollTimer = null;
  }

  protected patch(partial: Partial<MachineState>): void {
    this.store.set({ ...this.store.get(), ...partial });
  }

  protected info(text: string): void {
    this.console.add('info', 'info', text);
  }
}
