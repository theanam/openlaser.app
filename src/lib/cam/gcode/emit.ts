/**
 * Toolpath → G-code emitter with the modal optimizer (SPEC §6.5).
 *
 * The emitter tracks the modal state the controller will hold (motion mode, F, S and the formatted
 * X/Y position). With `optimize` it omits words that would not change that state; without it every
 * motion line carries full words. Positions are tracked as the formatted (rounded) values, so the
 * moves it reports are exactly what the machine executes, with no accumulated rounding drift.
 */
import type { Vec2 } from '../../geometry/types';
import type { Id } from '../../project/types';
import { segmentPower } from '../toolpath';
import type { GcodeOptions, Toolpath } from '../types';
import { formatCoordinate, formatInteger, powerToS, userLines } from './format';

export const DEFAULT_GCODE_OPTIONS: GcodeOptions = { optimize: true, leadingZero: true, comments: false };

/** GRBL 1.1 line buffer: lines must stay below this many characters. */
export const MAX_LINE_LENGTH = 80;

export interface EmitSettings {
  /** Controller S value for 100% power ($30). */
  maxS: number;
  header: string;
  footer: string;
  /** Emit M8 after the header and M9 in the footer. */
  airAssist: boolean;
  /** Final G0 target, or null to stay put. */
  returnTo: Vec2 | null;
  /** Assumed head position before the job, for travel distance and time. */
  start: Vec2;
  options: GcodeOptions;
  /** Layer names for debug comments. */
  layerNames?: ReadonlyMap<Id, string>;
}

/** One executed move, in formatted (machine) coordinates. */
export interface Move {
  x0: number;
  y0: number;
  x1: number;
  y1: number;
  rapid: boolean;
  /** mm/min; 0 for rapids. */
  feed: number;
  /** Controller S value; 0 for rapids. */
  s: number;
}

export interface EmitResult {
  lines: string[];
  moves: Move[];
}

export function emitGcode(toolpaths: readonly Toolpath[], settings: EmitSettings): EmitResult {
  // Start in the first toolpath's laser mode, so a constant-power (CO₂) job never switches.
  const firstMode = toolpaths[0]?.laserMode === 'constant' ? 'M3' : 'M4';
  const writer = new GcodeWriter(settings, firstMode);
  writer.raw('G90', 'G21', `${firstMode} S0`);
  writer.raw(...userLines(settings.header));
  if (settings.airAssist) writer.raw('M8');

  for (const toolpath of toolpaths) {
    if (settings.options.comments)
      writer.comment(settings.layerNames?.get(toolpath.layerId) ?? toolpath.layerId);
    writer.laserMode(toolpath.laserMode === 'constant' ? 'M3' : 'M4');
    const feed = Math.max(1, toolpath.feed);
    for (const run of toolpath.runs) {
      const pts = run.points;
      if (pts.length < 4) continue;
      writer.travel(pts[0], pts[1]);
      for (let i = 2; i + 1 < pts.length; i += 2) {
        writer.burn(pts[i], pts[i + 1], feed, powerToS(segmentPower(run, (i >> 1) - 1), settings.maxS));
      }
    }
  }

  writer.raw('M5 S0');
  if (settings.airAssist) writer.raw('M9');
  writer.raw(...userLines(settings.footer));
  if (settings.returnTo) writer.travel(settings.returnTo.x, settings.returnTo.y);
  return { lines: writer.lines, moves: writer.moves };
}

class GcodeWriter {
  readonly lines: string[] = [];
  readonly moves: Move[] = [];
  private motion: 'G0' | 'G1' | null = null;
  private mode: 'M3' | 'M4';
  private x: string | null = null;
  private y: string | null = null;
  private f: string | null = null;
  private s: string | null = '0';
  private posX: number;
  private posY: number;
  private readonly optimize: boolean;
  private readonly leadingZero: boolean;

  constructor(settings: EmitSettings, mode: 'M3' | 'M4' = 'M4') {
    this.mode = mode;
    this.optimize = settings.options.optimize;
    this.leadingZero = settings.options.leadingZero;
    this.posX = settings.start.x;
    this.posY = settings.start.y;
  }

  raw(...lines: string[]): void {
    this.lines.push(...lines);
  }

  comment(text: string): void {
    // Parentheses would end a GRBL comment early, and the whole line must fit the line buffer.
    const clean = text.replace(/[()\r\n]/g, ' ');
    this.lines.push(`; ${clean}`.slice(0, MAX_LINE_LENGTH - 1));
  }

  laserMode(mode: 'M3' | 'M4'): void {
    if (mode === this.mode) return;
    this.mode = mode;
    this.s = '0';
    this.lines.push(`${mode} S0`);
  }

  travel(x: number, y: number): void {
    this.move('G0', x, y, 0, 0);
  }

  burn(x: number, y: number, feed: number, s: number): void {
    this.move('G1', x, y, feed, s);
  }

  private move(motion: 'G0' | 'G1', x: number, y: number, feed: number, s: number): void {
    const fx = formatCoordinate(x, this.leadingZero);
    const fy = formatCoordinate(y, this.leadingZero);
    // A zero-length move does nothing on the machine; skipping it keeps both output modes identical.
    if (fx === this.x && fy === this.y) return;
    const full = !this.optimize;
    const words: string[] = [];
    if (full || this.motion !== motion) words.push(motion);
    if (full || fx !== this.x) words.push(`X${fx}`);
    if (full || fy !== this.y) words.push(`Y${fy}`);
    if (motion === 'G1') {
      const ff = formatInteger(feed);
      const fs = formatInteger(s);
      if (full || ff !== this.f) words.push(`F${ff}`);
      if (full || fs !== this.s) words.push(`S${fs}`);
      this.f = ff;
      this.s = fs;
    }
    this.lines.push(words.join(' '));
    this.motion = motion;
    this.x = fx;
    this.y = fy;
    const nx = Number(fx);
    const ny = Number(fy);
    this.moves.push({ x0: this.posX, y0: this.posY, x1: nx, y1: ny, rapid: motion === 'G0', feed, s });
    this.posX = nx;
    this.posY = ny;
  }
}
