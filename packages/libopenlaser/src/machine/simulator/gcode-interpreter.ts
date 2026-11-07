import type { Vec3 } from '../types';

export type SpindleMode = 'M3' | 'M4' | 'M5';

/** The subset of GRBL modal state the simulator tracks. */
export interface ModalState {
  motion: 0 | 1 | 2 | 3;
  absolute: boolean;
  inches: boolean;
  /** mm/min; 0 means not set yet. */
  feed: number;
  spindleSpeed: number;
  spindle: SpindleMode;
  flood: boolean;
  mist: boolean;
}

export function defaultModalState(): ModalState {
  return {
    motion: 0,
    absolute: true,
    inches: false,
    feed: 0,
    spindleSpeed: 0,
    spindle: 'M5',
    flood: false,
    mist: false,
  };
}

export interface PlannedMotion {
  rapid: boolean;
  /** Machine coordinates, mm. */
  target: Vec3;
  /** mm/min; ignored for rapids. */
  feed: number;
}

export type InterpretResult =
  | { ok: false; code: number }
  | { ok: true; modal: ModalState; motion: PlannedMotion | null; dwellMs: number | null; workOffset: Vec3 };

interface Word {
  letter: string;
  value: number;
}

const MM_PER_INCH = 25.4;
const VALUE_LETTERS = new Set(['F', 'S', 'X', 'Y', 'Z', 'I', 'J', 'K', 'R', 'P', 'N', 'T']);
const AXES = ['X', 'Y', 'Z'] as const;
const AXIS_KEY = { X: 'x', Y: 'y', Z: 'z' } as const;

function fail(code: number): InterpretResult {
  return { ok: false, code };
}

function parseWords(line: string): Word[] | number {
  const words: Word[] = [];
  let i = 0;
  while (i < line.length) {
    const letter = line[i];
    if (letter < 'A' || letter > 'Z') return 1;
    i++;
    const number = /^[-+]?(\d+\.?\d*|\.\d+)/.exec(line.slice(i));
    if (!number) return 2;
    words.push({ letter, value: Number.parseFloat(number[0]) });
    i += number[0].length;
  }
  return words;
}

/**
 * Interprets one normalized G-code line (uppercase, no spaces or comments). Arcs are treated as
 * straight moves to their end point, which is enough for position and burn tracking.
 * Error codes follow GRBL: 1/2 syntax, 20 unsupported, 21 modal conflict, 22 no feed rate,
 * 25 repeated word, 26 missing axis words, 28 missing value word.
 */
export function interpretGcode(
  line: string,
  current: ModalState,
  position: Vec3,
  workOffset: Vec3,
): InterpretResult {
  const parsed = parseWords(line);
  if (typeof parsed === 'number') return fail(parsed);

  const modal: ModalState = { ...current };
  let motion: 0 | 1 | 2 | 3 | null = null;
  let dwell = false;
  let machineCoordinates = false;
  let setOffset = false;
  let offset = { ...workOffset };
  const values = new Map<string, number>();

  for (const { letter, value } of parsed) {
    if (letter === 'G') {
      switch (value) {
        case 0:
        case 1:
        case 2:
        case 3:
          if (motion !== null) return fail(21);
          motion = value;
          break;
        case 4:
          dwell = true;
          break;
        case 17:
        case 54:
        case 94:
          break;
        case 20:
        case 21:
          modal.inches = value === 20;
          break;
        case 53:
          machineCoordinates = true;
          break;
        case 90:
        case 91:
          modal.absolute = value === 90;
          break;
        case 92:
          setOffset = true;
          break;
        case 92.1:
          offset = { x: 0, y: 0, z: 0 };
          break;
        default:
          return fail(20);
      }
    } else if (letter === 'M') {
      switch (value) {
        case 0:
        case 1:
          break;
        case 2:
        case 30:
          // Program end restores the defaults GRBL resets on M2/M30.
          Object.assign(modal, { motion: 1, absolute: true, spindle: 'M5', flood: false, mist: false });
          break;
        case 3:
        case 4:
        case 5:
          modal.spindle = `M${value}` as SpindleMode;
          break;
        case 7:
          modal.mist = true;
          break;
        case 8:
          modal.flood = true;
          break;
        case 9:
          modal.flood = false;
          modal.mist = false;
          break;
        default:
          return fail(20);
      }
    } else if (VALUE_LETTERS.has(letter)) {
      if (values.has(letter)) return fail(25);
      values.set(letter, value);
    } else {
      return fail(20);
    }
  }

  const scale = modal.inches ? MM_PER_INCH : 1;
  const feedWord = values.get('F');
  if (feedWord !== undefined) {
    if (feedWord < 0) return fail(4);
    modal.feed = feedWord * scale;
  }
  const speedWord = values.get('S');
  if (speedWord !== undefined) {
    if (speedWord < 0) return fail(4);
    modal.spindleSpeed = speedWord;
  }
  if (motion !== null) modal.motion = motion;

  const axisWords = AXES.filter((axis) => values.has(axis));

  if (setOffset) {
    if (axisWords.length === 0) return fail(26);
    for (const axis of axisWords) {
      const key = AXIS_KEY[axis];
      offset[key] = position[key] - (values.get(axis) ?? 0) * scale;
    }
    return { ok: true, modal, motion: null, dwellMs: null, workOffset: offset };
  }

  if (dwell) {
    const seconds = values.get('P');
    if (seconds === undefined) return fail(28);
    return { ok: true, modal, motion: null, dwellMs: Math.max(0, seconds) * 1000, workOffset: offset };
  }

  if (axisWords.length === 0) return { ok: true, modal, motion: null, dwellMs: null, workOffset: offset };

  const mode = motion ?? modal.motion;
  if (mode !== 0 && modal.feed <= 0) return fail(22);
  const target = { ...position };
  for (const axis of axisWords) {
    const key = AXIS_KEY[axis];
    const value = (values.get(axis) ?? 0) * scale;
    if (machineCoordinates) target[key] = value;
    else if (modal.absolute) target[key] = value + offset[key];
    else target[key] = position[key] + value;
  }
  return {
    ok: true,
    modal,
    motion: { rapid: mode === 0, target, feed: modal.feed },
    dwellMs: null,
    workOffset: offset,
  };
}

const JOG_G_CODES = new Set([20, 21, 53, 90, 91]);
const JOG_LETTERS = new Set(['G', 'X', 'Y', 'Z', 'F']);

/**
 * Interprets the body of a `$J=` jog. Only G20/G21/G53/G90/G91, axis words and F are allowed
 * (error 16 otherwise) and F is required (error 22). Modal changes do not persist after a jog.
 */
export function interpretJog(
  body: string,
  current: ModalState,
  position: Vec3,
  workOffset: Vec3,
): { ok: false; code: number } | { ok: true; motion: PlannedMotion } {
  const words = parseWords(body);
  if (typeof words === 'number') return { ok: false, code: words };
  for (const { letter, value } of words) {
    if (!JOG_LETTERS.has(letter) || (letter === 'G' && !JOG_G_CODES.has(value)))
      return { ok: false, code: 16 };
  }
  const result = interpretGcode(`G1${body}`, { ...current, feed: 0 }, position, workOffset);
  if (!result.ok) return result;
  if (!result.motion) return { ok: false, code: 26 };
  return { ok: true, motion: result.motion };
}
