import { JobStartError } from '../errors';
import type { GrblDriver } from '../grbl/driver';
import type { LineResponse } from '../grbl/line-accounting';
import type { ResetCause, StreamChannel } from '../grbl/stream-channel';
import { realScheduler, type Scheduler } from '../scheduler';
import { Listeners, writable } from '../store';
import type {
  ErrorPolicy,
  JobEvent,
  JobOutcome,
  JobPhase,
  JobProgress,
  JobRunnerApi,
  JobRunOptions,
  MachineState,
  Readable,
  Unsubscribe,
} from '../types';
import { streamLineProblem } from './gcode-lines';
import { estimateRemainingMs } from './remaining-time';

export interface JobRunnerOptions {
  scheduler?: Scheduler;
  /** Stop waits this long for Hold:0 before the soft reset (SPEC §7.3). */
  stopHoldTimeoutMs?: number;
  /** How long stop waits for the M5 acknowledgement after the reset. */
  stopM5TimeoutMs?: number;
  /** Minimum time between progress events; checked on acknowledgements, never with timers. */
  progressIntervalMs?: number;
}

interface Session {
  channel: StreamChannel;
  lines: string[];
  kind: 'job' | 'frame';
  policy: ErrorPolicy;
  estimatedMs: number | null;
  /** Index of the next line to write. */
  next: number;
  acked: number;
  startedAt: number;
  pausedAt: number | null;
  pausedMs: number;
  /** Every line acknowledged; completion waits for an Idle status report. */
  drained: boolean;
  /** A cycle start was requested and the machine has not been seen moving since. */
  resumePending: boolean;
  lastProgressAt: number;
  resolve(outcome: JobOutcome): void;
  subscriptions: Unsubscribe[];
}

const TERMINAL: ReadonlySet<JobPhase> = new Set(['idle', 'completed', 'aborted', 'failed']);

function idleProgress(): JobProgress {
  return {
    phase: 'idle',
    kind: 'job',
    total: 0,
    sent: 0,
    acked: 0,
    elapsedMs: 0,
    remainingMs: null,
    error: null,
    failureReason: null,
  };
}

/**
 * Streams G-code with GRBL character counting (SPEC §7.3). Strictly event-driven: lines are
 * written when an ok/error frees buffer space, never on a timer. Never starts, resumes or
 * replays anything on its own (SPEC §11).
 */
export class JobRunner implements JobRunnerApi {
  private readonly store = writable<JobProgress>(idleProgress());
  readonly progress: Readable<JobProgress> = {
    subscribe: (run) => this.store.subscribe(run),
    get: () => this.store.get(),
  };
  private readonly events = new Listeners<JobEvent>();
  private readonly scheduler: Scheduler;
  private readonly stopHoldTimeoutMs: number;
  private readonly stopM5TimeoutMs: number;
  private readonly progressIntervalMs: number;
  private session: Session | null = null;
  private stopping: Promise<void> | null = null;

  constructor(
    private readonly driver: GrblDriver,
    options: JobRunnerOptions = {},
  ) {
    this.scheduler = options.scheduler ?? realScheduler;
    this.stopHoldTimeoutMs = options.stopHoldTimeoutMs ?? 500;
    this.stopM5TimeoutMs = options.stopM5TimeoutMs ?? 2000;
    this.progressIntervalMs = options.progressIntervalMs ?? 100;
  }

  get active(): boolean {
    return !TERMINAL.has(this.store.get().phase);
  }

  onEvent(cb: (event: JobEvent) => void): Unsubscribe {
    return this.events.add(cb);
  }

  /** Starts streaming. Requires a connected, idle machine without an alarm (SPEC §11.5). */
  run(lines: string[], options: JobRunOptions = {}): Promise<JobOutcome> {
    if (this.active) return Promise.reject(new JobStartError('A job is already running'));
    const state = this.driver.state.get();
    if (state.connection !== 'connected')
      return Promise.reject(new JobStartError('The machine is not connected'));
    if (state.alarm || state.status === 'Alarm')
      return Promise.reject(new JobStartError('The machine is in alarm; home or unlock it first'));
    if (state.status !== 'Idle')
      return Promise.reject(new JobStartError(`The machine must be idle to start (it is ${state.status})`));
    const cleaned = lines.map((line) => line.trim());
    for (let i = 0; i < cleaned.length; i++) {
      const problem = streamLineProblem(cleaned[i], this.driver.rxSize);
      if (problem) return Promise.reject(new JobStartError(`Line ${i + 1} ${problem}: ${cleaned[i]}`));
    }

    const channel = this.driver.acquireStream();
    const kind = options.kind ?? 'job';
    return new Promise<JobOutcome>((resolve) => {
      const now = this.scheduler.now();
      const session: Session = {
        channel,
        lines: cleaned,
        kind,
        policy: options.errorPolicy ?? 'stop',
        estimatedMs: options.estimatedSeconds !== undefined ? options.estimatedSeconds * 1000 : null,
        next: 0,
        acked: 0,
        startedAt: now,
        pausedAt: null,
        pausedMs: 0,
        drained: false,
        resumePending: false,
        lastProgressAt: now,
        resolve,
        subscriptions: [],
      };
      this.session = session;
      session.subscriptions = [
        channel.onWritable(() => this.pump(session)),
        channel.onStatusReport((machine) => this.handleStatus(session, machine)),
        channel.onAlarm((alarm) => this.handleAlarm(session, alarm)),
        channel.onReset((cause) => this.handleReset(session, cause)),
        channel.onDisconnect((reason) => this.handleDisconnect(session, reason)),
      ];
      this.store.set({ ...idleProgress(), phase: 'running', kind, total: cleaned.length });
      this.events.emit({ type: 'started', total: cleaned.length, kind });
      this.pump(session);
      this.checkDrained(session);
    });
  }

  pause(): void {
    const session = this.session;
    if (!session || this.store.get().phase !== 'running') return;
    session.channel.realtime('feed-hold');
    session.pausedAt = this.scheduler.now();
    this.setPhase('paused');
    this.events.emit({ type: 'paused' });
  }

  resume(): void {
    const session = this.session;
    if (!session || this.store.get().phase !== 'paused') return;
    this.endPause(session);
    session.resumePending = true;
    session.channel.realtime('cycle-start');
    this.setPhase('running');
    this.events.emit({ type: 'resumed' });
  }

  continueAfterError(): void {
    const session = this.session;
    if (!session || this.store.get().phase !== 'error-hold') return;
    this.endPause(session);
    this.store.update((p) => ({ ...p, phase: 'running', error: null }));
    session.resumePending = true;
    session.channel.realtime('cycle-start');
    this.events.emit({ type: 'resumed' });
    this.pump(session);
    this.checkDrained(session);
  }

  /** Feed hold, wait for Hold:0 (max 500 ms), soft reset, then M5 after the welcome. */
  stop(): Promise<void> {
    if (this.stopping) return this.stopping;
    const session = this.session;
    if (!session || !this.active) return Promise.resolve();
    this.stopping = this.runStop(session).finally(() => {
      this.stopping = null;
    });
    return this.stopping;
  }

  private async runStop(session: Session): Promise<void> {
    this.setPhase('stopping');
    const { channel } = session;
    channel.realtime('feed-hold');
    channel.realtime('status');
    await this.waitForHoldComplete(session);
    if (this.session !== session) return;
    await channel.softReset();
    if (this.session !== session) return;
    await this.sendFinalM5(session);
    if (this.session === session) this.finish(session, 'aborted');
  }

  /** Resolves on a fresh status report showing the hold completed (or no motion), or timeout. */
  private waitForHoldComplete(session: Session): Promise<void> {
    return new Promise<void>((resolve) => {
      const done = () => {
        this.scheduler.clearTimeout(timer);
        unsubscribe();
        resolve();
      };
      const timer = this.scheduler.setTimeout(done, this.stopHoldTimeoutMs);
      const unsubscribe = session.channel.onStatusReport((machine) => {
        const held = machine.status === 'Hold' && machine.subState === 0;
        if (held || machine.status === 'Idle' || machine.status === 'Alarm') done();
      });
      session.subscriptions.push(unsubscribe);
    });
  }

  private sendFinalM5(session: Session): Promise<void> {
    const { channel } = session;
    if (!channel.canWrite('M5')) return Promise.resolve();
    return new Promise<void>((resolve) => {
      const timer = this.scheduler.setTimeout(resolve, this.stopM5TimeoutMs);
      const done = () => {
        this.scheduler.clearTimeout(timer);
        resolve();
      };
      channel.writeLine('M5', done).catch(done);
    });
  }

  // ---- streaming ----------------------------------------------------------------------------

  private pump(session: Session): void {
    if (this.session !== session) return;
    const phase = this.store.get().phase;
    if (phase !== 'running' && phase !== 'paused') return;
    const { channel, lines } = session;
    while (session.next < lines.length && channel.canWrite(lines[session.next])) {
      const index = session.next++;
      channel
        .writeLine(lines[index], (response) => this.handleResponse(session, index, response))
        .catch((error: unknown) => {
          this.fail(
            session,
            `Could not write to the machine: ${error instanceof Error ? error.message : String(error)}`,
          );
        });
    }
    this.publishProgress(session, false);
  }

  private handleResponse(session: Session, index: number, response: LineResponse): void {
    if (this.session !== session) return;
    session.acked++;
    if (!response.ok) {
      const error = {
        code: response.code,
        message: response.message,
        line: session.lines[index],
        lineIndex: index,
      };
      this.events.emit({ type: 'line-error', ...error });
      const phase = this.store.get().phase;
      if (session.policy === 'stop' && (phase === 'running' || phase === 'paused')) {
        session.channel.realtime('feed-hold');
        if (session.pausedAt === null) session.pausedAt = this.scheduler.now();
        this.store.update((p) => ({ ...p, phase: 'error-hold', error }));
        this.publishProgress(session, true);
      }
    }
    this.checkDrained(session);
  }

  private checkDrained(session: Session): void {
    if (session.drained || session.acked < session.lines.length) return;
    session.drained = true;
    this.publishProgress(session, true);
    // Motion may still be running from the planner: completion waits for an Idle report.
    session.channel.realtime('status');
  }

  private handleStatus(session: Session, machine: MachineState): void {
    if (this.session !== session) return;
    const phase = this.store.get().phase;
    if (phase !== 'running') return;
    if (session.resumePending) {
      // GRBL ignores a cycle start while the hold is still decelerating (Hold:1): resend it.
      if (machine.status === 'Hold' && machine.subState === 0) session.channel.realtime('cycle-start');
      else if (machine.status !== 'Hold') session.resumePending = false;
    } else if (machine.status === 'Hold' || machine.status === 'Door') {
      // Held from outside the app (pause button on the machine, safety door): reflect it, and
      // leave resuming to the user.
      session.pausedAt = this.scheduler.now();
      this.setPhase('paused');
      this.events.emit({ type: 'paused' });
      return;
    }
    if (
      session.drained &&
      !session.resumePending &&
      (machine.status === 'Idle' || machine.status === 'Check')
    ) {
      this.finish(session, 'completed');
    }
  }

  private handleAlarm(session: Session, alarm: { code: number; message: string }): void {
    if (this.session !== session || this.store.get().phase === 'stopping') return;
    this.fail(session, `ALARM:${alarm.code} ${alarm.message}`);
  }

  private handleReset(session: Session, cause: ResetCause): void {
    if (this.session !== session || cause === 'stream') return;
    if (cause === 'user') this.finish(session, 'aborted');
    else
      this.fail(
        session,
        'The controller reset unexpectedly. The job was not resumed; check the machine before starting again.',
      );
  }

  private handleDisconnect(session: Session, reason: string): void {
    if (this.session !== session) return;
    this.fail(
      session,
      `Connection to the machine was lost (${reason}). The laser stops when its buffer runs out; check the machine.`,
    );
  }

  // ---- bookkeeping --------------------------------------------------------------------------

  private endPause(session: Session): void {
    if (session.pausedAt !== null) session.pausedMs += this.scheduler.now() - session.pausedAt;
    session.pausedAt = null;
  }

  private setPhase(phase: JobPhase): void {
    this.store.update((p) => ({ ...p, phase }));
    if (this.session) this.publishProgress(this.session, true);
  }

  private publishProgress(session: Session, force: boolean): void {
    const now = this.scheduler.now();
    if (!force && now - session.lastProgressAt < this.progressIntervalMs) return;
    session.lastProgressAt = now;
    const elapsedMs = now - session.startedAt;
    const pausedMs = session.pausedMs + (session.pausedAt !== null ? now - session.pausedAt : 0);
    const progress: JobProgress = {
      ...this.store.get(),
      total: session.lines.length,
      sent: session.next,
      acked: session.acked,
      elapsedMs,
      remainingMs: estimateRemainingMs({
        total: session.lines.length,
        acked: session.acked,
        activeMs: elapsedMs - pausedMs,
        estimatedMs: session.estimatedMs,
      }),
    };
    this.store.set(progress);
    this.events.emit({ type: 'progress', progress });
  }

  private fail(session: Session, reason: string): void {
    if (this.session !== session) return;
    this.store.update((p) => ({ ...p, failureReason: reason }));
    this.finish(session, 'failed', reason);
  }

  private finish(session: Session, outcome: JobOutcome, reason?: string): void {
    if (this.session !== session) return;
    this.session = null;
    for (const unsubscribe of session.subscriptions) unsubscribe();
    session.channel.release();
    this.store.update((p) => ({ ...p, phase: outcome }));
    this.publishProgress(session, true);
    if (outcome === 'completed')
      this.events.emit({ type: 'completed', elapsedMs: this.store.get().elapsedMs });
    else if (outcome === 'aborted') this.events.emit({ type: 'aborted' });
    else this.events.emit({ type: 'failed', reason: reason ?? 'Job failed' });
    session.resolve(outcome);
  }
}
