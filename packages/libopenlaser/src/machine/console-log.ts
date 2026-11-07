import { Listeners } from './store';
import type { ConsoleDirection, ConsoleEntry, ConsoleKind, Unsubscribe } from './types';

export const CONSOLE_CAPACITY = 10_000;

/** Ring buffer of console traffic (SPEC §7.5). Old entries are dropped once capacity is reached. */
export class ConsoleLog {
  private readonly buffer: (ConsoleEntry | undefined)[];
  private start = 0;
  private count = 0;
  private nextId = 1;
  private readonly listeners = new Listeners<ConsoleEntry>();

  constructor(
    private readonly clock: () => number = Date.now,
    readonly capacity = CONSOLE_CAPACITY,
  ) {
    this.buffer = new Array<ConsoleEntry | undefined>(capacity);
  }

  add(direction: ConsoleDirection, kind: ConsoleKind, text: string): ConsoleEntry {
    const entry: ConsoleEntry = { id: this.nextId++, time: this.clock(), direction, kind, text };
    const slot = (this.start + this.count) % this.capacity;
    this.buffer[slot] = entry;
    if (this.count < this.capacity) this.count++;
    else this.start = (this.start + 1) % this.capacity;
    this.listeners.emit(entry);
    return entry;
  }

  /** Oldest first. */
  entries(): ConsoleEntry[] {
    const out: ConsoleEntry[] = [];
    for (let i = 0; i < this.count; i++) {
      const entry = this.buffer[(this.start + i) % this.capacity];
      if (entry) out.push(entry);
    }
    return out;
  }

  get size(): number {
    return this.count;
  }

  clear(): void {
    this.buffer.fill(undefined);
    this.start = 0;
    this.count = 0;
  }

  onEntry(cb: (entry: ConsoleEntry) => void): Unsubscribe {
    return this.listeners.add(cb);
  }
}

const DIRECTION_MARK: Record<ConsoleDirection, string> = { sent: '>>', received: '<<', info: '--' };

export function formatConsoleEntry(entry: ConsoleEntry): string {
  return `${new Date(entry.time).toISOString()} ${DIRECTION_MARK[entry.direction]} ${entry.text}`;
}

/** Plain text for "Copy log". */
export function formatConsoleText(entries: readonly ConsoleEntry[]): string {
  return entries.map(formatConsoleEntry).join('\n');
}

export interface ConsoleReportContext {
  appName: string;
  appVersion: string;
  userAgent: string;
  firmware: { name: string; version: string } | null;
  settings: Record<number, string>;
  /** ms since epoch. */
  generatedAt: number;
}

/** Text for "Download log": the environment header bug reports need, then the log itself. */
export function formatConsoleReport(entries: readonly ConsoleEntry[], context: ConsoleReportContext): string {
  const settingLines = Object.keys(context.settings)
    .map(Number)
    .sort((a, b) => a - b)
    .map((n) => `$${n}=${context.settings[n]}`);
  const firmware = context.firmware
    ? `${context.firmware.name} ${context.firmware.version}`
    : 'not connected';
  return [
    `${context.appName} ${context.appVersion} console log`,
    `Generated: ${new Date(context.generatedAt).toISOString()}`,
    `User agent: ${context.userAgent}`,
    `Firmware: ${firmware}`,
    '',
    'Settings:',
    ...(settingLines.length > 0 ? settingLines : ['(not read)']),
    '',
    `Log (${entries.length} entries):`,
    formatConsoleText(entries),
    '',
  ].join('\n');
}
