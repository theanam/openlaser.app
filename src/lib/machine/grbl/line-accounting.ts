/** Outcome of one streamed or queued line. */
export type LineResponse = { ok: true } | { ok: false; code: number; message: string };

export interface InFlightLine {
  line: string;
  /** Bytes on the wire including the trailing `\n`. */
  byteLength: number;
  /** Called exactly once with the matching ok/error. */
  settle(response: LineResponse): void;
  /** Called instead of `settle` when a reset or disconnect discards the line. */
  discard(reason: Error): void;
}

/**
 * Character-counting bookkeeping (SPEC §7.3): the FIFO of lines sent but not yet acknowledged.
 * Shared by manual commands and job streaming so every ok/error maps to exactly one line.
 */
export class LineAccounting {
  private queue: InFlightLine[] = [];
  private head = 0;
  private bytes = 0;

  constructor(public rxSize = 128) {}

  get inFlightBytes(): number {
    return this.bytes;
  }

  get inFlightCount(): number {
    return this.queue.length - this.head;
  }

  /** Keeps one byte of margin, as the spec requires. */
  fits(byteLength: number): boolean {
    return this.bytes + byteLength <= this.rxSize - 1;
  }

  push(entry: InFlightLine): void {
    this.queue.push(entry);
    this.bytes += entry.byteLength;
  }

  /** The oldest unacknowledged line, which the next ok/error belongs to. */
  shift(): InFlightLine | undefined {
    if (this.head >= this.queue.length) return undefined;
    const entry = this.queue[this.head++];
    this.bytes -= entry.byteLength;
    if (this.head > 1024 && this.head * 2 > this.queue.length) {
      this.queue = this.queue.slice(this.head);
      this.head = 0;
    }
    return entry;
  }

  /** Forgets every in-flight line (after a reset or disconnect) and returns them oldest first. */
  drain(): InFlightLine[] {
    const drained = this.queue.slice(this.head);
    this.queue = [];
    this.head = 0;
    this.bytes = 0;
    return drained;
  }
}

/** Byte length on the wire for a line plus its terminating newline. Lines are ASCII-only. */
export function wireLength(line: string): number {
  return line.length + 1;
}

/** Printable ASCII plus tab. Bytes ≥ 0x80 would be read by GRBL as realtime overrides. */
export function isSendableText(line: string): boolean {
  return /^[\x20-\x7e\t]*$/.test(line);
}
