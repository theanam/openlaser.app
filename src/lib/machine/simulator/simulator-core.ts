import { normalizeGcodeLine } from '../grbl/gcode-format';
import { realScheduler, type Scheduler, type TimerHandle } from '../scheduler';
import { Listeners } from '../store';
import type { Vec3 } from '../types';
import { DEFAULT_SIMULATOR_SETTINGS } from './default-settings';
import type { SimulatorFaults } from './faults';
import { defaultModalState, interpretGcode, type ModalState, type PlannedMotion } from './gcode-interpreter';
import { MotionPlanner, type MotionBlock } from './motion';
import { SimulatorOutput } from './output';
import { createSeededRandom } from './random';
import { ByteRecorder } from './recorder';
import { defaultOverrides, formatStatusReport, type Overrides } from './status';
import {
  SIMULATOR_WELCOME,
  executeSystemCommand,
  type SimulatorStatus,
  type SystemCommandHost,
} from './system-commands';

export interface GrblSimulatorOptions {
  /** Virtual clock for tests, real timers (default) for the UI. */
  scheduler?: Scheduler;
  /** Seeded RNG for fault injection; defaults to seed 1. */
  random?: () => number;
  rxBufferSize?: number;
  plannerBlocks?: number;
  /** Print the welcome message when the port opens (most boards reset on open). */
  welcomeOnOpen?: boolean;
  /** Print line noise before the welcome message, like some boards do while booting. */
  bootGarbage?: boolean;
  homingDurationMs?: number;
  settings?: Record<number, number>;
  faults?: SimulatorFaults;
}

/** GRBL's serial line buffer: 80 bytes including the terminator. */
const MAX_LINE_LENGTH = 79;
const UNLOCK_HINT = "[MSG:'$H'|'$X' to unlock]";
const ZERO: Vec3 = { x: 0, y: 0, z: 0 };

/**
 * Controller state, line processing and motion of the simulated GRBL. GrblSimulator adds the
 * byte intake, realtime commands and soft reset on top.
 */
export abstract class SimulatorCore implements SystemCommandHost {
  readonly rxBufferSize: number;
  readonly plannerBlocks: number;
  faults: SimulatorFaults;
  settings: Record<number, number>;
  modal: ModalState = defaultModalState();
  workOffset: Vec3 = { ...ZERO };
  plannedPosition: Vec3 = { ...ZERO };
  homed = false;
  checkMode = false;
  /** Every non-empty line the controller executed, in order. */
  readonly receivedLines: string[] = [];
  overflowCount = 0;
  /** Highest RX buffer fill level seen, in bytes. */
  peakRxBytes = 0;

  protected readonly scheduler: Scheduler;
  protected readonly output: SimulatorOutput;
  protected readonly planner: MotionPlanner;
  protected readonly options: GrblSimulatorOptions;
  protected powered = false;
  protected rx = '';
  /** Characters of the current line were dropped because it exceeded the line buffer. */
  protected lineOverflowed = false;
  protected alarm: { code: number | null; critical: boolean } | null = null;
  protected homingTimer: TimerHandle | null = null;
  protected door = false;
  protected overrides: Overrides = defaultOverrides();
  protected spindleStopped = false;
  protected statusCount = 0;
  protected overridesChanged = false;
  protected lineNumber = 0;
  protected readonly recorder = new ByteRecorder();
  protected readonly overflowListeners = new Listeners<{ byte: number; total: number }>();
  protected readonly disconnectListeners = new Listeners<string>();

  constructor(options: GrblSimulatorOptions = {}) {
    this.options = options;
    this.scheduler = options.scheduler ?? realScheduler;
    this.rxBufferSize = options.rxBufferSize ?? 128;
    this.plannerBlocks = options.plannerBlocks ?? 15;
    this.faults = options.faults ?? {};
    this.settings = { ...DEFAULT_SIMULATOR_SETTINGS, ...options.settings };
    const random = options.random ?? createSeededRandom(1);
    this.output = new SimulatorOutput(this.scheduler, random, () => this.faults);
    this.planner = new MotionPlanner(this.scheduler, this.plannerBlocks, {
      rapidRate: () => Math.min(this.settings[110], this.settings[111]),
      maxFeedRate: () => Math.min(this.settings[110], this.settings[111]),
      feedOverride: () => this.overrides.feed,
      rapidOverride: () => this.overrides.rapid,
      laserPower: (block) => this.laserPower(block),
      onBlockComplete: () => this.processRx(),
    });
  }

  get status(): SimulatorStatus {
    if (this.alarm) return 'Alarm';
    if (this.homingTimer !== null) return 'Home';
    if (this.door) return 'Door';
    const phase = this.planner.state;
    if (phase === 'decelerating' || phase === 'held') return 'Hold';
    if (phase === 'running') return this.planner.jogging ? 'Jog' : 'Run';
    return this.checkMode ? 'Check' : 'Idle';
  }

  /** Soft reset, as when 0x18 is received. */
  abstract reset(): void;

  protected sendWelcome(): void {
    this.output.sendLine('');
    this.output.sendLine(SIMULATOR_WELCOME);
    if (this.alarm) this.output.sendLine(UNLOCK_HINT);
  }

  protected raiseAlarm(code: number): void {
    this.planner.abort();
    this.plannedPosition = this.planner.currentPosition();
    const critical = code === 1 || code === 2;
    this.alarm = { code, critical };
    if (code !== 2) this.homed = false;
    this.output.sendLine(`ALARM:${code}`);
    if (critical) this.output.sendLine('[MSG:Reset to continue]');
  }

  // ---- line processing ------------------------------------------------------------------------

  /** Pulls complete lines from the RX buffer while the planner and machine state allow it. */
  protected processRx(): void {
    while (this.powered && this.homingTimer === null && !this.alarm?.critical) {
      const end = this.rx.search(/[\r\n]/);
      if (end < 0) {
        // A line longer than the whole RX buffer: GRBL keeps reading and reports error:11.
        if (this.rx.length >= this.rxBufferSize) {
          this.rx = '';
          this.lineOverflowed = true;
        }
        return;
      }
      const raw = this.rx.slice(0, end);
      const normalized = normalizeGcodeLine(raw);
      if (normalized !== '' && !normalized.startsWith('$') && this.planner.isFull) return;
      this.rx = this.rx.slice(end + 1);
      this.executeLine(raw, normalized);
    }
  }

  protected executeLine(raw: string, normalized: string): void {
    if (this.lineOverflowed || normalized.length > MAX_LINE_LENGTH) {
      this.lineOverflowed = false;
      this.respond(11);
      return;
    }
    if (normalized === '') {
      this.respond('ok');
      return;
    }
    this.lineNumber++;
    this.receivedLines.push(raw);
    const alarmCode = this.faults.lineAlarm?.(raw, this.lineNumber) ?? null;
    if (alarmCode !== null) {
      this.raiseAlarm(alarmCode);
      return;
    }
    const injected = this.faults.lineError?.(raw, this.lineNumber) ?? null;
    if (injected !== null) {
      this.respond(injected);
      return;
    }
    if (normalized.startsWith('$')) {
      const outcome = executeSystemCommand(normalized, this);
      if (outcome.response !== 'deferred') this.respond(outcome.response);
      outcome.afterAck?.();
      return;
    }
    this.respond(this.executeGcode(normalized));
  }

  protected executeGcode(normalized: string): 'ok' | number {
    if (this.alarm || this.planner.jogging) return 9;
    const result = interpretGcode(normalized, this.modal, this.plannedPosition, this.workOffset);
    if (!result.ok) return result.code;
    this.modal = result.modal;
    this.workOffset = result.workOffset;
    if (this.checkMode) return 'ok';
    if (result.motion) this.plan(result.motion, false);
    if (result.dwellMs !== null)
      this.planner.add(this.block(this.plannedPosition, false, false, result.dwellMs));
    return 'ok';
  }

  protected plan(motion: PlannedMotion, jog: boolean): void {
    const block = this.block(motion.target, motion.rapid, jog, null);
    block.feed = motion.feed;
    this.planner.add(block);
    this.plannedPosition = { ...motion.target };
  }

  protected block(to: Vec3, rapid: boolean, jog: boolean, dwellMs: number | null): MotionBlock {
    const m = this.modal;
    return {
      from: { ...this.plannedPosition },
      to: { ...to },
      rapid,
      jog,
      feed: m.feed,
      spindle: m.spindle,
      spindleSpeed: m.spindleSpeed,
      dwellMs,
    };
  }

  protected respond(response: 'ok' | number): void {
    this.output.sendLine(response === 'ok' ? 'ok' : `error:${response}`);
  }

  /**
   * Laser output for a block. In laser mode ($32=1) G0 moves never fire; without it the
   * spindle output stays on during rapids too. M4 is recorded as such (power scales with speed
   * on the real machine).
   */
  protected laserPower(block: MotionBlock): number {
    if (block.spindle === 'M5' || this.spindleStopped) return 0;
    if (block.rapid && this.settings[32] === 1) return 0;
    const clamped = Math.min(block.spindleSpeed, this.settings[30]);
    return Math.min((clamped * this.overrides.spindle) / 100, this.settings[30]);
  }

  protected cancelHoming(): void {
    if (this.homingTimer !== null) this.scheduler.clearTimeout(this.homingTimer);
    this.homingTimer = null;
  }

  protected statusReport(): string {
    const count = this.statusCount++;
    // Like GRBL, WCO and Ov are only sent periodically (and Ov right after a change).
    const includeWorkOffset = count % 10 === 0;
    const includeOverrides = !includeWorkOffset && (this.overridesChanged || count % 10 === 5);
    if (includeOverrides) this.overridesChanged = false;
    const spindleOn = this.modal.spindle !== 'M5';
    return formatStatusReport({
      status: this.status,
      subState:
        this.status === 'Hold' ? (this.planner.state === 'held' ? 0 : 1) : this.status === 'Door' ? 0 : null,
      mpos: this.planner.currentPosition(),
      workOffset: this.workOffset,
      reportMachinePosition: (this.settings[10] & 1) === 1,
      buffer:
        (this.settings[10] & 2) === 2
          ? {
              plannerFree: this.plannerBlocks - this.planner.count,
              rxFree: this.rxBufferSize - this.rx.length,
            }
          : null,
      feed: this.planner.currentFeed,
      spindle: spindleOn ? this.modal.spindleSpeed : 0,
      includeWorkOffset,
      overrides: includeOverrides ? this.overrides : null,
    });
  }

  // ---- SystemCommandHost: used by the `$` command handlers ------------------------------------

  sendLine(line: string): void {
    this.output.sendLine(line);
  }

  unlock(): void {
    this.alarm = null;
  }

  startJog(motion: PlannedMotion): void {
    this.plan(motion, true);
  }

  setCheckMode(enabled: boolean): void {
    this.checkMode = enabled;
  }

  restoreDefaults(): void {
    this.settings = { ...DEFAULT_SIMULATOR_SETTINGS, ...this.options.settings };
  }

  startHoming(): void {
    this.planner.abort();
    this.homingTimer = this.scheduler.setTimeout(() => {
      this.homingTimer = null;
      this.planner.setPosition(ZERO);
      this.plannedPosition = { ...ZERO };
      this.homed = true;
      this.alarm = null;
      this.respond('ok');
      this.processRx();
    }, this.options.homingDurationMs ?? 1500);
  }
}
