/**
 * GRBL behind the machine connection contract: the existing driver and job runner, unchanged,
 * with the common status, run, frame and stop on top.
 */
import type { ConnectionStatus, MachineConnection, RunOutcome } from '../adapter';
import { IDLE_STATUS } from '../adapter';
import { JobRunner, type JobRunnerOptions } from '../job/runner';
import { realScheduler, type Scheduler } from '../scheduler';
import { Listeners, writable } from '../store';
import type {
  ConsoleEntry,
  ErrorPolicy,
  HandshakeResult,
  JobOutcome,
  JobProgress,
  MachineState,
  Transport,
  Unsubscribe,
} from '../types';
import type { MachineProfile } from '../../project/types';
import { GrblDriver } from './driver';
import type { GrblDriverOptions } from './driver-options';
import { describeAlarm } from './error-codes';

/** A G-code job, as the CAM emitter writes it. */
export interface GrblJob {
  lines: string[];
  estimatedSeconds?: number;
  errorPolicy?: ErrorPolicy;
}

/** Statuses where the machine is moving or paused mid-motion. */
export const GRBL_MOVING_STATES: ReadonlySet<MachineState['status']> = new Set([
  'Run',
  'Jog',
  'Home',
  'Hold',
  'Door',
  'Check',
]);

export interface GrblConnectionOptions {
  driver?: GrblDriverOptions;
  runner?: Omit<JobRunnerOptions, 'scheduler'>;
  scheduler?: Scheduler;
}

function activityOf(state: MachineState, progress: JobProgress | null): ConnectionStatus['activity'] {
  switch (progress?.phase) {
    case 'running':
      return progress.kind === 'frame' ? 'framing' : 'running';
    case 'paused':
    case 'error-hold':
      return 'paused';
    case 'stopping':
      return 'stopping';
  }
  return GRBL_MOVING_STATES.has(state.status) ? 'busy' : 'idle';
}

export class GrblConnection implements MachineConnection<GrblJob, string[]> {
  readonly capabilities = { frame: true, pause: true, console: true };
  /** Exists before `connect`, so callers can watch the handshake. */
  readonly driver: GrblDriver;
  runner: JobRunner | null = null;
  handshake: HandshakeResult | null = null;
  private readonly store = writable<ConnectionStatus>(IDLE_STATUS);
  readonly status = this.store;
  private readonly lost = new Listeners<string>();
  private offs: Unsubscribe[] = [];
  private closing = false;
  private readonly scheduler: Scheduler;

  constructor(private readonly options: GrblConnectionOptions = {}) {
    this.scheduler = options.scheduler ?? realScheduler;
    this.driver = new GrblDriver({ scheduler: this.scheduler, ...options.driver });
  }

  /** Opens an already chosen transport. */
  static async open(
    transport: Transport,
    profile: MachineProfile,
    options: GrblConnectionOptions = {},
  ): Promise<GrblConnection> {
    const connection = new GrblConnection(options);
    try {
      await connection.connect(transport, profile);
    } catch (error) {
      await connection.disconnect().catch(() => undefined);
      throw error;
    }
    return connection;
  }

  async connect(transport: Transport, profile: MachineProfile): Promise<HandshakeResult> {
    this.closing = false;
    const handshake = await this.driver.connect(transport, profile);
    const runner = new JobRunner(this.driver, { scheduler: this.scheduler, ...this.options.runner });
    this.runner = runner;
    this.handshake = handshake;
    let wasConnected = false;
    const update = () => {
      const state = this.driver.state.get();
      const progress = runner.active ? runner.progress.get() : null;
      this.store.set({
        connection: state.connection,
        activity: activityOf(state, progress),
        progress: progress?.total ? Math.round((progress.acked / progress.total) * 100) : null,
        error: state.alarm ? describeAlarm(state.alarm.code).name : null,
      });
      if (wasConnected && state.connection === 'disconnected' && !this.closing) {
        this.lost.emit('The machine disconnected.');
      }
      wasConnected = state.connection === 'connected';
    };
    this.offs = [this.driver.state.subscribe(update), runner.progress.subscribe(update)];
    return handshake;
  }

  get canStop(): boolean {
    if (this.driver.state.get().connection !== 'connected') return false;
    return (this.runner?.active ?? false) || GRBL_MOVING_STATES.has(this.driver.state.get().status);
  }

  frame(lines: string[]): Promise<RunOutcome> {
    return this.start(lines, { kind: 'frame' });
  }

  run(job: GrblJob): Promise<RunOutcome> {
    return this.start(job.lines, {
      kind: 'job',
      errorPolicy: job.errorPolicy,
      estimatedSeconds: job.estimatedSeconds,
    });
  }

  private async start(
    lines: string[],
    options: { kind: 'job' | 'frame'; errorPolicy?: ErrorPolicy; estimatedSeconds?: number },
  ): Promise<RunOutcome> {
    const runner = this.requireRunner();
    const outcome: JobOutcome = await runner.run(lines, options);
    if (outcome === 'failed') {
      return { outcome, reason: runner.progress.get().failureReason ?? 'The job failed.' };
    }
    return { outcome };
  }

  async pause(): Promise<void> {
    this.runner?.pause();
  }

  async resume(): Promise<void> {
    this.runner?.resume();
  }

  /**
   * A job or frame stops through the runner. A jog ends with jog cancel (the machine returns to
   * Idle; a feed hold would strand it in Hold). Other manual motion gets a hold, then a reset, so
   * nothing queued resumes later.
   */
  async stop(): Promise<void> {
    if (this.runner?.active) {
      await this.runner.stop();
      return;
    }
    const status = this.driver.state.get().status;
    if (!GRBL_MOVING_STATES.has(status)) return;
    if (status === 'Jog') {
      this.driver.cancelJog();
      return;
    }
    this.driver.realtime('feed-hold');
    await this.waitForStatus(['Hold', 'Idle', 'Alarm'], 500);
    await this.driver.softReset('user');
  }

  async disconnect(): Promise<void> {
    this.closing = true;
    for (const off of this.offs) off();
    this.offs = [];
    this.runner = null;
    this.store.set(IDLE_STATUS);
    await this.driver.disconnect();
  }

  onLost(cb: (reason: string) => void): Unsubscribe {
    return this.lost.add(cb);
  }

  onConsole(cb: (entry: ConsoleEntry) => void): Unsubscribe {
    return this.driver.onConsole(cb);
  }

  private requireRunner(): JobRunner {
    if (!this.runner) throw new Error('The machine is not connected.');
    return this.runner;
  }

  private async waitForStatus(states: MachineState['status'][], timeoutMs: number): Promise<void> {
    const start = this.scheduler.now();
    while (!states.includes(this.driver.state.get().status) && this.scheduler.now() - start < timeoutMs) {
      await new Promise((resolve) => this.scheduler.setTimeout(() => resolve(undefined), 20));
    }
  }
}
