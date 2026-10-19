import type { PathData, Segment, Vec2 } from '../../geometry/types';
import { arcToCubics } from './arc';

/** Number of arguments per command (lowercase). */
const ARITY: Record<string, number> = { m: 2, l: 2, h: 1, v: 1, c: 6, s: 4, q: 4, t: 2, a: 7, z: 0 };

const NUMBER = /[-+]?(?:\d+\.?\d*|\.\d+)(?:[eE][-+]?\d+)?/y;

/** Character-level tokenizer for path data: numbers may run together (`1.5.5`, `-1-2`, `1e-3`). */
class PathScanner {
  private pos = 0;

  constructor(private readonly text: string) {}

  /** Skips whitespace and commas; returns the next command letter if one is next. */
  command(): string | null {
    this.skipSeparators();
    const ch = this.text[this.pos];
    if (ch !== undefined && /[MmLlHhVvCcSsQqTtAaZz]/.test(ch)) {
      this.pos++;
      return ch;
    }
    return null;
  }

  atEnd(): boolean {
    this.skipSeparators();
    return this.pos >= this.text.length;
  }

  number(): number | null {
    this.skipSeparators();
    NUMBER.lastIndex = this.pos;
    const match = NUMBER.exec(this.text);
    if (!match) return null;
    this.pos = NUMBER.lastIndex;
    return parseFloat(match[0]);
  }

  /** Arc flags are a single 0 or 1 and may be written without separators (`a1 1 0 01 5 5`). */
  flag(): boolean | null {
    this.skipSeparators();
    const ch = this.text[this.pos];
    if (ch !== '0' && ch !== '1') return null;
    this.pos++;
    return ch === '1';
  }

  private skipSeparators(): void {
    while (this.pos < this.text.length && /[\s,]/.test(this.text[this.pos])) this.pos++;
  }
}

/** Accumulates subpaths and the pen state while commands run. */
class PathBuilder {
  readonly paths: PathData[] = [];
  current: Vec2 = { x: 0, y: 0 };
  private subpathStart: Vec2 = { x: 0, y: 0 };
  private open: PathData | null = null;

  moveTo(p: Vec2): void {
    this.flush();
    this.open = { closed: false, segments: [], start: p };
    this.subpathStart = p;
    this.current = p;
  }

  add(segment: Segment): void {
    if (!this.open) this.moveTo(this.current);
    (this.open as PathData).segments.push(segment);
    this.current = segment.to;
  }

  /** Closes with an explicit line back to the start, so consumers need not special-case `closed`. */
  close(): void {
    if (this.open) {
      const { x, y } = this.subpathStart;
      if (this.current.x !== x || this.current.y !== y) this.open.segments.push({ type: 'L', to: { x, y } });
      this.open.closed = true;
    }
    this.flush();
    this.current = this.subpathStart;
  }

  flush(): void {
    if (this.open && this.open.segments.length > 0) this.paths.push(this.open);
    this.open = null;
  }
}

/**
 * Parses SVG path data (full grammar, absolute and relative commands, implicit repeats) into
 * absolute subpaths of lines and cubics in user units. Quadratics are raised to cubics and arcs
 * become cubics. On a syntax error the path is kept up to the error, as browsers render it.
 */
export function parsePathData(d: string | null): PathData[] {
  const builder = new PathBuilder();
  if (!d) return builder.paths;
  const scanner = new PathScanner(d);
  let command: string | null = null;
  // Reflection points for S and T; reset whenever the previous command was of another kind.
  let lastCubicControl: Vec2 | null = null;
  let lastQuadControl: Vec2 | null = null;

  while (!scanner.atEnd()) {
    const explicit = scanner.command();
    if (explicit) command = explicit;
    else if (command === null || command === 'z' || command === 'Z') break;
    const cmd = command as string;
    const lower = cmd.toLowerCase();
    const relative = cmd === lower;
    const args = readArgs(scanner, lower);
    if (!args) break;
    const base = relative ? builder.current : { x: 0, y: 0 };
    const pt = (ix: number): Vec2 => ({ x: base.x + args[ix], y: base.y + args[ix + 1] });
    const from = builder.current;
    let cubicControl: Vec2 | null = null;
    let quadControl: Vec2 | null = null;

    switch (lower) {
      case 'm':
        builder.moveTo(pt(0));
        // Further coordinate pairs after a moveto are implicit linetos.
        command = relative ? 'l' : 'L';
        break;
      case 'l':
        builder.add({ type: 'L', to: pt(0) });
        break;
      case 'h':
        builder.add({ type: 'L', to: { x: (relative ? from.x : 0) + args[0], y: from.y } });
        break;
      case 'v':
        builder.add({ type: 'L', to: { x: from.x, y: (relative ? from.y : 0) + args[0] } });
        break;
      case 'c':
        cubicControl = pt(2);
        builder.add({ type: 'C', c1: pt(0), c2: cubicControl, to: pt(4) });
        break;
      case 's': {
        const c1 = lastCubicControl ? reflect(lastCubicControl, from) : from;
        cubicControl = pt(0);
        builder.add({ type: 'C', c1, c2: cubicControl, to: pt(2) });
        break;
      }
      case 'q':
        quadControl = pt(0);
        builder.add(quadToCubic(from, quadControl, pt(2)));
        break;
      case 't':
        quadControl = lastQuadControl ? reflect(lastQuadControl, from) : from;
        builder.add(quadToCubic(from, quadControl, pt(0)));
        break;
      case 'a': {
        const to = pt(5);
        const segments = arcToCubics(
          from.x,
          from.y,
          args[0],
          args[1],
          args[2],
          args[3] === 1,
          args[4] === 1,
          to.x,
          to.y,
        );
        for (const segment of segments) builder.add(segment);
        break;
      }
      case 'z':
        builder.close();
        break;
    }
    lastCubicControl = cubicControl;
    lastQuadControl = quadControl;
  }
  builder.flush();
  return builder.paths;
}

/** Reads one command's arguments; arc flags come back as 0/1. Null on a syntax error. */
function readArgs(scanner: PathScanner, lower: string): number[] | null {
  const args: number[] = [];
  for (let i = 0; i < ARITY[lower]; i++) {
    let value: number | null;
    if (lower === 'a' && (i === 3 || i === 4)) {
      const flag = scanner.flag();
      value = flag === null ? null : flag ? 1 : 0;
    } else {
      value = scanner.number();
    }
    if (value === null) return null;
    args.push(value);
  }
  return args;
}

function reflect(control: Vec2, about: Vec2): Vec2 {
  return { x: 2 * about.x - control.x, y: 2 * about.y - control.y };
}

/** Exact degree elevation: control points sit 2/3 of the way from each end toward the quad control. */
export function quadToCubic(from: Vec2, control: Vec2, to: Vec2): Segment {
  return {
    type: 'C',
    c1: { x: from.x + (2 / 3) * (control.x - from.x), y: from.y + (2 / 3) * (control.y - from.y) },
    c2: { x: to.x + (2 / 3) * (control.x - to.x), y: to.y + (2 / 3) * (control.y - to.y) },
    to,
  };
}
