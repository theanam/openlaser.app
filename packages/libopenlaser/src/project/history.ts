/**
 * Undo/redo over immutable snapshots (SPEC §4). Every mutation produces a new project value, so a
 * snapshot is just a reference: cheap, and assets (Blobs) are shared between snapshots.
 */
export const HISTORY_LIMIT = 200;

export class History<T> {
  private past: T[] = [];
  private future: T[] = [];
  /** Commits sharing a key in a row collapse into one step (drags, scrubbing). */
  private lastKey: string | null = null;

  constructor(private readonly limit = HISTORY_LIMIT) {}

  get canUndo(): boolean {
    return this.past.length > 0;
  }

  get canRedo(): boolean {
    return this.future.length > 0;
  }

  get size(): number {
    return this.past.length;
  }

  /** Records `previous` as the state to return to. */
  record(previous: T, coalesceKey: string | null = null): void {
    this.future = [];
    if (coalesceKey !== null && coalesceKey === this.lastKey) return;
    this.lastKey = coalesceKey;
    this.past.push(previous);
    if (this.past.length > this.limit) this.past.shift();
  }

  /** Ends any coalescing run, so the next commit is its own step. */
  seal(): void {
    this.lastKey = null;
  }

  undo(current: T): T | null {
    const previous = this.past.pop();
    if (previous === undefined) return null;
    this.future.push(current);
    this.lastKey = null;
    return previous;
  }

  redo(current: T): T | null {
    const next = this.future.pop();
    if (next === undefined) return null;
    this.past.push(current);
    this.lastKey = null;
    return next;
  }

  clear(): void {
    this.past = [];
    this.future = [];
    this.lastKey = null;
  }
}
