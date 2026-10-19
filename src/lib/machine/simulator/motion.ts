import type { Scheduler, TimerHandle } from '../scheduler';
import type { Vec2, Vec3 } from '../types';
import type { SpindleMode } from './gcode-interpreter';

/** One straight stretch the laser fired along, in machine XY coordinates. */
export interface BurnSegment {
  from: Vec2;
  to: Vec2;
  /** Effective S (after clamping to $30 and the spindle override). */
  power: number;
  mode: 'M3' | 'M4';
  /** mm/min actually used. */
  feed: number;
}

export interface MotionBlock {
  from: Vec3;
  to: Vec3;
  rapid: boolean;
  jog: boolean;
  /** Programmed feed for G1/G2/G3 and jogs, mm/min. */
  feed: number;
  spindle: SpindleMode;
  spindleSpeed: number;
  /** For G4 dwell blocks: duration with no motion. */
  dwellMs: number | null;
}

export interface MotionEnvironment {
  /** mm/min for G0 before the rapid override. */
  rapidRate(): number;
  /** Axis rate cap for feed moves, mm/min. */
  maxFeedRate(): number;
  feedOverride(): number;
  rapidOverride(): number;
  /** Laser power for a block given the current settings and overrides; 0 = laser off. */
  laserPower(block: MotionBlock): number;
  onBlockComplete(): void;
}

export type MotionPhase = 'idle' | 'running' | 'decelerating' | 'held';

const ZERO_LENGTH = 1e-9;

function distance(a: Vec3, b: Vec3): number {
  return Math.hypot(b.x - a.x, b.y - a.y, b.z - a.z);
}

function lerp(a: Vec3, b: Vec3, t: number): Vec3 {
  return { x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t, z: a.z + (b.z - a.z) * t };
}

/**
 * Planner buffer plus a time-based executor. Each block takes distance / rate on the scheduler
 * clock; acceleration is ignored except for the feed-hold deceleration time.
 */
export class MotionPlanner {
  private blocks: MotionBlock[] = [];
  private phase: MotionPhase = 'idle';
  private position: Vec3 = { x: 0, y: 0, z: 0 };
  private executing: { startedAt: number; durationMs: number; timer: TimerHandle } | null = null;
  private holdTimer: TimerHandle | null = null;
  readonly burns: BurnSegment[] = [];

  constructor(
    private readonly scheduler: Scheduler,
    readonly capacity: number,
    private readonly env: MotionEnvironment,
  ) {}

  get state(): MotionPhase {
    return this.phase;
  }

  get count(): number {
    return this.blocks.length;
  }

  get isFull(): boolean {
    return this.blocks.length >= this.capacity;
  }

  /** True while the head block is a jog (status reports `Jog`). */
  get jogging(): boolean {
    return this.blocks.length > 0 && this.blocks[0].jog;
  }

  get currentFeed(): number {
    if (!this.executing || this.blocks.length === 0) return 0;
    return this.rateFor(this.blocks[0]);
  }

  currentPosition(): Vec3 {
    if (!this.executing || this.blocks.length === 0) return { ...this.position };
    const block = this.blocks[0];
    const t =
      this.executing.durationMs > 0
        ? Math.min(1, (this.scheduler.now() - this.executing.startedAt) / this.executing.durationMs)
        : 1;
    return lerp(block.from, block.to, t);
  }

  /** Teleports (homing). Only valid with an empty planner. */
  setPosition(position: Vec3): void {
    this.position = { ...position };
  }

  add(block: MotionBlock): void {
    if (block.dwellMs === null && distance(block.from, block.to) < ZERO_LENGTH) return;
    this.blocks.push(block);
    if (this.phase === 'idle') {
      this.phase = 'running';
      this.startHead();
    }
  }

  /** Feed hold: motion stops (after the deceleration time the status reports Hold:0). */
  hold(decelerationMs: number): void {
    if (this.phase === 'decelerating' || this.phase === 'held') return;
    const wasMoving = this.executing !== null;
    this.stopAtCurrentPosition();
    if (!wasMoving) {
      this.phase = 'held';
      return;
    }
    this.phase = 'decelerating';
    this.holdTimer = this.scheduler.setTimeout(() => {
      this.holdTimer = null;
      this.phase = 'held';
    }, decelerationMs);
  }

  /** Cycle start. Ignored unless the hold has completed, as in GRBL. */
  resume(): boolean {
    if (this.phase !== 'held') return false;
    this.phase = this.blocks.length > 0 ? 'running' : 'idle';
    if (this.phase === 'running') this.startHead();
    return true;
  }

  /** Stops immediately and drops every queued block (reset, alarm, jog cancel). */
  abort(): { wasMoving: boolean } {
    const wasMoving = this.executing !== null || this.phase === 'decelerating';
    this.stopAtCurrentPosition();
    if (this.holdTimer !== null) this.scheduler.clearTimeout(this.holdTimer);
    this.holdTimer = null;
    this.blocks = [];
    this.phase = 'idle';
    return { wasMoving };
  }

  /** Re-times the running block after an override change. */
  reprice(): void {
    if (this.phase !== 'running' || !this.executing) return;
    this.stopAtCurrentPosition();
    this.startHead();
  }

  /** Splits the head block at the current position, recording what was burned so far. */
  private stopAtCurrentPosition(): void {
    if (!this.executing || this.blocks.length === 0) return;
    this.scheduler.clearTimeout(this.executing.timer);
    const block = this.blocks[0];
    const here = this.currentPosition();
    const elapsed = this.scheduler.now() - this.executing.startedAt;
    this.record(block, block.from, here);
    this.position = here;
    if (block.dwellMs !== null) block.dwellMs = Math.max(0, block.dwellMs - elapsed);
    else block.from = here;
    this.executing = null;
  }

  private rateFor(block: MotionBlock): number {
    if (block.rapid) return (this.env.rapidRate() * this.env.rapidOverride()) / 100;
    const capped = Math.min(block.feed, this.env.maxFeedRate());
    // GRBL does not apply the feed override to jogs.
    return block.jog ? capped : (capped * this.env.feedOverride()) / 100;
  }

  private startHead(): void {
    const block = this.blocks[0];
    if (!block) {
      this.phase = 'idle';
      return;
    }
    const durationMs =
      block.dwellMs ?? (distance(block.from, block.to) / Math.max(this.rateFor(block), 1e-6)) * 60_000;
    const timer = this.scheduler.setTimeout(() => this.completeHead(), durationMs);
    this.executing = { startedAt: this.scheduler.now(), durationMs, timer };
  }

  private completeHead(): void {
    const block = this.blocks.shift();
    this.executing = null;
    if (block) {
      this.record(block, block.from, block.to);
      if (block.dwellMs === null) this.position = { ...block.to };
    }
    if (this.blocks.length > 0) this.startHead();
    else this.phase = 'idle';
    this.env.onBlockComplete();
  }

  private record(block: MotionBlock, from: Vec3, to: Vec3): void {
    if (block.dwellMs !== null || block.spindle === 'M5') return;
    if (Math.hypot(to.x - from.x, to.y - from.y) < ZERO_LENGTH) return;
    const power = this.env.laserPower(block);
    if (power <= 0) return;
    this.burns.push({
      from: { x: from.x, y: from.y },
      to: { x: to.x, y: to.y },
      power,
      mode: block.spindle,
      feed: this.rateFor(block),
    });
  }
}
