import type { Scheduler } from '../scheduler';

export interface GrblDriverOptions {
  scheduler?: Scheduler;
  /** Wall clock for console timestamps (ms since epoch). */
  wallClock?: () => number;
  /** Status poll interval while connected (SPEC §7.2). */
  statusPollMs?: number;
  /** Status poll interval while a job holds the stream. */
  jobStatusPollMs?: number;
  /** How long to wait for the welcome message on connect, before and after a reset. */
  welcomeTimeoutMs?: number;
  /** How long to wait for the welcome message after a soft reset before un-gating writes. */
  resetTimeoutMs?: number;
  consoleCapacity?: number;
}
