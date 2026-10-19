import type { MoveList, Rect } from '../cam/types';

const INITIAL_CAPACITY = 4096;

/** Growable typed-array storage for parsed moves (amortised O(1) push, no per-move objects). */
export class MoveBuffer {
  private count = 0;
  private capacity = INITIAL_CAPACITY;
  private coords = new Float32Array(INITIAL_CAPACITY * 4);
  private power = new Float32Array(INITIAL_CAPACITY);
  private rapid = new Uint8Array(INITIAL_CAPACITY);
  private line = new Uint32Array(INITIAL_CAPACITY);
  private bounds = emptyBounds();
  private burnBounds = emptyBounds();

  push(x0: number, y0: number, x1: number, y1: number, power: number, rapid: boolean, line: number): void {
    if (this.count === this.capacity) this.grow();
    const n = this.count++;
    const c = n * 4;
    this.coords[c] = x0;
    this.coords[c + 1] = y0;
    this.coords[c + 2] = x1;
    this.coords[c + 3] = y1;
    this.power[n] = power;
    this.rapid[n] = rapid ? 1 : 0;
    this.line[n] = line;
    include(this.bounds, x0, y0, x1, y1);
    if (power > 0) include(this.burnBounds, x0, y0, x1, y1);
  }

  /** Copies the used part into exactly-sized arrays. */
  finish(lineCount: number): MoveList {
    const n = this.count;
    return {
      count: n,
      coords: this.coords.slice(0, n * 4),
      power: this.power.slice(0, n),
      rapid: this.rapid.slice(0, n),
      line: this.line.slice(0, n),
      lineCount,
      bounds: n > 0 ? { ...this.bounds } : null,
      burnBounds: this.burnBounds.minX <= this.burnBounds.maxX ? { ...this.burnBounds } : null,
    };
  }

  private grow(): void {
    this.capacity *= 2;
    this.coords = resized(this.coords, this.capacity * 4);
    this.power = resized(this.power, this.capacity);
    this.rapid = resized(this.rapid, this.capacity);
    this.line = resized(this.line, this.capacity);
  }
}

function resized<T extends Float32Array | Uint8Array | Uint32Array>(array: T, length: number): T {
  const next = new (array.constructor as new (n: number) => T)(length);
  next.set(array);
  return next;
}

function emptyBounds(): Rect {
  return { minX: Infinity, minY: Infinity, maxX: -Infinity, maxY: -Infinity };
}

function include(r: Rect, x0: number, y0: number, x1: number, y1: number): void {
  if (x0 < r.minX) r.minX = x0;
  if (x1 < r.minX) r.minX = x1;
  if (y0 < r.minY) r.minY = y0;
  if (y1 < r.minY) r.minY = y1;
  if (x0 > r.maxX) r.maxX = x0;
  if (x1 > r.maxX) r.maxX = x1;
  if (y0 > r.maxY) r.maxY = y0;
  if (y1 > r.maxY) r.maxY = y1;
}
