import type { MoveList } from '../cam/types';
import { GCODE_EXTENSIONS } from '../config/app';
import { MoveBuffer } from './gcode-moves';

export { splitGcodeLines, validateGcodeLines, type GcodeLineIssue } from './gcode-lines';

export interface ParseGcodeOptions {
  /** S value that means 100 % power ($30). Default 1000. */
  maxS?: number;
  /** Chord tolerance in mm for flattening G2/G3 arcs. Default 0.05. */
  arcTolerance?: number;
}

const DEFAULT_MAX_S = 1000;
const DEFAULT_ARC_TOLERANCE = 0.05;
const INCH = 25.4;

/** True for file names with a G-code extension we accept (.gcode .nc .gc .ngc .txt). */
export function isGcodeFileName(name: string): boolean {
  const lower = name.toLowerCase();
  return GCODE_EXTENSIONS.some((ext) => lower.endsWith(ext));
}

/** Modal state carried between lines. */
interface ModalState {
  x: number;
  y: number;
  /** -1 = no motion mode (after G80). */
  motion: number;
  relative: boolean;
  unitScale: number;
  laserOn: boolean;
  s: number;
}

/** Words found on one line. Axis values are raw (not yet unit-scaled). */
interface LineWords {
  x: number;
  y: number;
  i: number;
  j: number;
  r: number;
  hasX: boolean;
  hasY: boolean;
  hasI: boolean;
  hasJ: boolean;
  hasR: boolean;
  /** G4, G10, G28, G30, G38, G92: axis words are parameters, not a move in the plane. */
  axesAreParameters: boolean;
  number: NumberSlot;
}

/**
 * Parses G-code for preview and framing (SPEC §5.3). Supports G0/G1/G2/G3 (arcs flattened,
 * I/J incremental centers or R), G80, G90/G91, G20/G21, M3/M4/M5 with modal S, `;` and `( )`
 * comments, N line numbers, any letter case. `$` and `%` lines are counted but make no moves.
 * The XY plane (G17) is assumed. G0 is always laser off (GRBL laser mode).
 */
export function parseGcode(text: string, options: ParseGcodeOptions = {}): MoveList {
  const maxS = options.maxS && options.maxS > 0 ? options.maxS : DEFAULT_MAX_S;
  const tolerance = options.arcTolerance ?? DEFAULT_ARC_TOLERANCE;
  const moves = new MoveBuffer();
  const state: ModalState = { x: 0, y: 0, motion: 0, relative: false, unitScale: 1, laserOn: false, s: 0 };
  const words: LineWords = {
    x: 0,
    y: 0,
    i: 0,
    j: 0,
    r: 0,
    hasX: false,
    hasY: false,
    hasI: false,
    hasJ: false,
    hasR: false,
    axesAreParameters: false,
    number: { value: NaN },
  };
  let lineIndex = 0;
  let pos = 0;
  const length = text.length;
  while (pos < length) {
    let end = text.indexOf('\n', pos);
    if (end < 0) end = length;
    if (parseLine(text, pos, end, state, words)) {
      emitMotion(state, words, lineIndex, maxS, tolerance, moves);
    }
    lineIndex++;
    pos = end + 1;
  }
  return moves.finish(lineIndex);
}

/** Reads one line's words into `words` and updates modal state. Returns true when it may move. */
function parseLine(text: string, start: number, end: number, state: ModalState, words: LineWords): boolean {
  words.hasX = words.hasY = words.hasI = words.hasJ = words.hasR = false;
  words.axesAreParameters = false;
  let k = start;
  while (k < end && isSpace(text.charCodeAt(k))) k++;
  const first = text.charCodeAt(k);
  if (k >= end || first === 0x24 /* $ */ || first === 0x25 /* % */) return false;

  while (k < end) {
    const c = text.charCodeAt(k);
    if (c === 0x3b /* ; */) break;
    if (c === 0x28 /* ( */) {
      const close = text.indexOf(')', k);
      k = close < 0 || close > end ? end : close + 1;
      continue;
    }
    const letter = c | 0x20;
    if (letter < 0x61 || letter > 0x7a) {
      k++;
      continue;
    }
    k = readNumber(text, k + 1, end, words.number);
    if (Number.isNaN(words.number.value)) continue;
    applyWord(letter, words.number.value, state, words);
  }
  return words.hasX || words.hasY;
}

function applyWord(letter: number, value: number, state: ModalState, words: LineWords): void {
  switch (letter) {
    case 0x67 /* g */:
      applyGWord(Math.round(value * 10), state, words);
      break;
    case 0x6d /* m */:
      if (value === 3 || value === 4) state.laserOn = true;
      else if (value === 5 || value === 2 || value === 30) state.laserOn = false;
      break;
    case 0x73 /* s */:
      state.s = value;
      break;
    case 0x78 /* x */:
      words.x = value;
      words.hasX = true;
      break;
    case 0x79 /* y */:
      words.y = value;
      words.hasY = true;
      break;
    case 0x69 /* i */:
      words.i = value;
      words.hasI = true;
      break;
    case 0x6a /* j */:
      words.j = value;
      words.hasJ = true;
      break;
    case 0x72 /* r */:
      words.r = value;
      words.hasR = true;
      break;
  }
}

/** `code` is the G number × 10 (G90.1 → 901). */
function applyGWord(code: number, state: ModalState, words: LineWords): void {
  switch (code) {
    case 0:
    case 10:
    case 20:
    case 30:
      state.motion = code / 10;
      break;
    case 800:
      state.motion = -1;
      break;
    case 900:
      state.relative = false;
      break;
    case 910:
      state.relative = true;
      break;
    case 200:
      state.unitScale = INCH;
      break;
    case 210:
      state.unitScale = 1;
      break;
    case 40:
    case 100:
    case 280:
    case 281:
    case 300:
    case 301:
    case 920:
    case 921:
    case 922:
    case 923:
      words.axesAreParameters = true;
      break;
    default:
      if (code >= 382 && code <= 385) words.axesAreParameters = true;
  }
}

function emitMotion(
  state: ModalState,
  words: LineWords,
  line: number,
  maxS: number,
  tolerance: number,
  moves: MoveBuffer,
): void {
  if (words.axesAreParameters || state.motion < 0) return;
  const scale = state.unitScale;
  const fromX = state.x;
  const fromY = state.y;
  let toX = fromX;
  let toY = fromY;
  if (words.hasX) toX = state.relative ? fromX + words.x * scale : words.x * scale;
  if (words.hasY) toY = state.relative ? fromY + words.y * scale : words.y * scale;
  state.x = toX;
  state.y = toY;
  const rapid = state.motion === 0;
  const power = rapid || !state.laserOn ? 0 : Math.min(1, Math.max(0, state.s / maxS));
  if (state.motion <= 1) {
    if (toX !== fromX || toY !== fromY) moves.push(fromX, fromY, toX, toY, power, rapid, line);
    return;
  }
  const clockwise = state.motion === 2;
  let cx: number;
  let cy: number;
  if (words.hasR) {
    const center = centerFromRadius(fromX, fromY, toX, toY, words.r * scale, clockwise);
    if (!center) return;
    [cx, cy] = center;
  } else {
    cx = fromX + (words.hasI ? words.i * scale : 0);
    cy = fromY + (words.hasJ ? words.j * scale : 0);
  }
  flattenArc(fromX, fromY, toX, toY, cx, cy, clockwise, tolerance, (x0, y0, x1, y1) =>
    moves.push(x0, y0, x1, y1, power, false, line),
  );
}

/** Arc center for the R form, following GRBL: negative R selects the arc longer than 180°. */
function centerFromRadius(
  x0: number,
  y0: number,
  x1: number,
  y1: number,
  radius: number,
  clockwise: boolean,
): [number, number] | null {
  const dx = x1 - x0;
  const dy = y1 - y0;
  const chord = Math.hypot(dx, dy);
  if (chord === 0) return null;
  const h = Math.sqrt(Math.max(0, 4 * radius * radius - dx * dx - dy * dy));
  let hOverD = -h / chord;
  if (!clockwise) hOverD = -hOverD;
  if (radius < 0) hOverD = -hOverD;
  return [x0 + 0.5 * (dx - dy * hOverD), y0 + 0.5 * (dy + dx * hOverD)];
}

function flattenArc(
  x0: number,
  y0: number,
  x1: number,
  y1: number,
  cx: number,
  cy: number,
  clockwise: boolean,
  tolerance: number,
  emit: (ax: number, ay: number, bx: number, by: number) => void,
): void {
  const radius = Math.hypot(x0 - cx, y0 - cy);
  const startAngle = Math.atan2(y0 - cy, x0 - cx);
  let sweep = Math.atan2(y1 - cy, x1 - cx) - startAngle;
  const closed = Math.abs(x1 - x0) < 1e-9 && Math.abs(y1 - y0) < 1e-9;
  if (clockwise) {
    if (sweep >= 0 || closed) sweep -= 2 * Math.PI;
  } else if (sweep <= 0 || closed) {
    sweep += 2 * Math.PI;
  }
  if (radius < 1e-9) {
    if (!closed) emit(x0, y0, x1, y1);
    return;
  }
  const maxStep = radius > tolerance ? 2 * Math.acos(1 - tolerance / radius) : Math.PI;
  const steps = Math.max(1, Math.ceil(Math.abs(sweep) / maxStep));
  let px = x0;
  let py = y0;
  for (let n = 1; n < steps; n++) {
    const angle = startAngle + (sweep * n) / steps;
    const nx = cx + radius * Math.cos(angle);
    const ny = cy + radius * Math.sin(angle);
    emit(px, py, nx, ny);
    px = nx;
    py = ny;
  }
  emit(px, py, x1, y1);
}

function isSpace(c: number): boolean {
  return c === 0x20 || c === 0x09 || c === 0x0d;
}

/** Output slot for readNumber, so parsing a word allocates nothing. */
interface NumberSlot {
  value: number;
}

/**
 * Parses a decimal number starting at `k` (spaces allowed before it) into `slot.value` (NaN when
 * there are no digits). Returns the index after it.
 */
function readNumber(text: string, k: number, end: number, slot: NumberSlot): number {
  while (k < end && isSpace(text.charCodeAt(k))) k++;
  let sign = 1;
  const c = text.charCodeAt(k);
  if (c === 0x2d /* - */ || c === 0x2b /* + */) {
    if (c === 0x2d) sign = -1;
    k++;
  }
  let value = 0;
  let digits = 0;
  while (k < end) {
    const d = text.charCodeAt(k) - 0x30;
    if (d < 0 || d > 9) break;
    value = value * 10 + d;
    digits++;
    k++;
  }
  if (k < end && text.charCodeAt(k) === 0x2e /* . */) {
    k++;
    let fraction = 0.1;
    while (k < end) {
      const d = text.charCodeAt(k) - 0x30;
      if (d < 0 || d > 9) break;
      value += d * fraction;
      fraction *= 0.1;
      digits++;
      k++;
    }
  }
  slot.value = digits > 0 ? sign * value : NaN;
  return k;
}
