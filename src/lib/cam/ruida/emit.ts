/**
 * Toolpaths → a Ruida .rd job file, laid out as MeerK40t writes them (MIT, see encode.ts): a header
 * with job and per-layer bounds and settings, then each layer's settings and moves, then a checksum
 * and end-of-file. Coordinates are bed mm from the machine's home corner, sent as absolute µm.
 */
import type { Rect } from '../../geometry/types';
import { segmentPower } from '../toolpath';
import type { Toolpath } from '../types';
import { encode14, encode35, encodeCoord, encodePower, encodeSpeed, swizzle } from './encode';

export interface RuidaLayer {
  /** `#rrggbb`, shown in the controller's layer list. */
  color: string;
}

export interface RuidaSettings {
  layers: ReadonlyMap<string, RuidaLayer>;
  /** Air assist allowed by the machine; each layer still chooses. */
  airAssist: boolean;
}

/** The byte commands used here (unswizzled). Names follow MeerK40t. */
const CMD = {
  REF_POINT_2: [0xd8, 0x10],
  SET_ABSOLUTE: [0xe6, 0x01],
  REF_POINT_SET: [0xf0],
  ENABLE_BLOCK_CUTTING: [0xf1, 0x02],
  START_PROCESS: [0xd8, 0x00],
  FEED_REPEAT: [0xe7, 0x06],
  SET_FEED_AUTO_PAUSE: [0xe7, 0x38],
  PROCESS_TOP_LEFT: [0xe7, 0x03],
  PROCESS_BOTTOM_RIGHT: [0xe7, 0x07],
  DOCUMENT_MIN_POINT: [0xe7, 0x50],
  DOCUMENT_MAX_POINT: [0xe7, 0x51],
  PROCESS_REPEAT: [0xe7, 0x04],
  ARRAY_DIRECTION: [0xe7, 0x05],
  SPEED_LASER_1_PART: [0xc9, 0x04],
  MIN_POWER_1_PART: [0xc6, 0x31],
  MAX_POWER_1_PART: [0xc6, 0x32],
  MIN_POWER_2_PART: [0xc6, 0x41],
  MAX_POWER_2_PART: [0xc6, 0x42],
  LAYER_COLOR_PART: [0xca, 0x06],
  WORK_MODE_PART: [0xca, 0x41],
  PART_MIN_POINT: [0xe7, 0x52],
  PART_MAX_POINT: [0xe7, 0x53],
  PART_MIN_POINT_EX: [0xe7, 0x61],
  PART_MAX_POINT_EX: [0xe7, 0x62],
  MAX_LAYER_PART: [0xca, 0x22],
  PEN_OFFSET: [0xe7, 0x54],
  LAYER_OFFSET: [0xe7, 0x55],
  DISPLAY_OFFSET: [0xf1, 0x03],
  FEED_INFO: [0xe7, 0x0a],
  ARRAY_START: [0xea],
  SET_CURRENT_ELEMENT_INDEX: [0xe7, 0x60],
  ARRAY_EN_MIRROR_CUT: [0xe7, 0x0b],
  ARRAY_MIN_POINT: [0xe7, 0x13],
  ARRAY_MAX_POINT: [0xe7, 0x17],
  ARRAY_ADD: [0xe7, 0x23],
  ARRAY_MIRROR: [0xe7, 0x24],
  ARRAY_REPEAT: [0xe7, 0x08],
  BLOCK_END: [0xe7, 0x00],
  LAYER_END: [0xca, 0x01, 0x00],
  EN_LASER_2_OFFSET_0: [0xca, 0x01, 0x30],
  LAYER_NUMBER_PART: [0xca, 0x02],
  LASER_DEVICE_0: [0xca, 0x01, 0x10],
  AIR_ASSIST_ON: [0xca, 0x01, 0x13],
  AIR_ASSIST_OFF: [0xca, 0x01, 0x12],
  SPEED_LASER_1: [0xc9, 0x02],
  LASER_ON_DELAY: [0xc6, 0x12],
  LASER_OFF_DELAY: [0xc6, 0x13],
  MIN_POWER_1: [0xc6, 0x01],
  MAX_POWER_1: [0xc6, 0x02],
  MIN_POWER_2: [0xc6, 0x21],
  MAX_POWER_2: [0xc6, 0x22],
  EN_LASER_TUBE_START: [0xca, 0x03],
  SET_FILE_SUM: [0xe5, 0x05],
  END_OF_FILE: [0xd7],
  MOVE_ABS_XY: [0x88],
  CUT_ABS_XY: [0xa8],
} as const;

/** Most controllers hold 256 layers; the job compiler emits one toolpath per output layer. */
export const MAX_RUIDA_LAYERS = 256;

class RdWriter {
  readonly bytes: number[] = [];
  private sum = 0;

  cmd(command: readonly number[], ...args: number[][]): void {
    for (const b of command) this.push(b);
    for (const arg of args) for (const b of arg) this.push(b);
  }

  private push(b: number): void {
    this.bytes.push(b);
    this.sum += b;
  }

  get checksum(): number {
    return this.sum;
  }
}

const index = (n: number) => [n & 0xff];

function toolpathBounds(tp: Toolpath): Rect | null {
  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  for (const run of tp.runs) {
    for (let i = 0; i + 1 < run.points.length; i += 2) {
      minX = Math.min(minX, run.points[i]!);
      maxX = Math.max(maxX, run.points[i]!);
      minY = Math.min(minY, run.points[i + 1]!);
      maxY = Math.max(maxY, run.points[i + 1]!);
    }
  }
  return Number.isFinite(minX) ? { minX, minY, maxX, maxY } : null;
}

function layerPower(tp: Toolpath): number {
  let max = 0;
  for (const run of tp.runs) {
    const powers = Array.isArray(run.power) ? run.power : [run.power];
    for (const p of powers) max = Math.max(max, p);
  }
  return max;
}

/** RDWorks stores layer colours as 0x00BBGGRR. */
function colorValue(hex: string): number {
  const n = parseInt(hex.replace('#', '').slice(0, 6), 16);
  if (!Number.isFinite(n)) return 0;
  return ((n & 0xff) << 16) | (n & 0xff00) | ((n >> 16) & 0xff);
}

export function emitRuida(toolpaths: readonly Toolpath[], settings: RuidaSettings): Uint8Array {
  const paths = toolpaths.filter((tp) => toolpathBounds(tp) !== null);
  if (paths.length === 0) throw new Error('Nothing to burn.');
  if (paths.length > MAX_RUIDA_LAYERS)
    throw new Error(`Ruida controllers take up to ${MAX_RUIDA_LAYERS} layers.`);
  const bounds = paths.map((tp) => toolpathBounds(tp)!);
  const all: Rect = {
    minX: Math.min(...bounds.map((b) => b.minX)),
    minY: Math.min(...bounds.map((b) => b.minY)),
    maxX: Math.max(...bounds.map((b) => b.maxX)),
    maxY: Math.max(...bounds.map((b) => b.maxY)),
  };
  const w = new RdWriter();
  const zero = encode35(0);

  // Header: job bounds, then each layer's speed, power, colour and bounds.
  w.cmd(CMD.REF_POINT_2);
  w.cmd(CMD.SET_ABSOLUTE);
  w.cmd(CMD.REF_POINT_SET);
  w.cmd(CMD.ENABLE_BLOCK_CUTTING, index(0));
  w.cmd(CMD.START_PROCESS);
  w.cmd(CMD.FEED_REPEAT, zero, zero);
  w.cmd(CMD.SET_FEED_AUTO_PAUSE, index(0));
  w.cmd(CMD.PROCESS_TOP_LEFT, encodeCoord(all.maxX), encodeCoord(all.minY));
  w.cmd(CMD.PROCESS_BOTTOM_RIGHT, encodeCoord(all.minX), encodeCoord(all.maxY));
  w.cmd(CMD.DOCUMENT_MIN_POINT, encodeCoord(all.maxX), encodeCoord(all.minY));
  w.cmd(CMD.DOCUMENT_MAX_POINT, encodeCoord(all.minX), encodeCoord(all.maxY));
  w.cmd(CMD.PROCESS_REPEAT, ...[1, 1, 0, 0, 0, 0, 0].map(encode14));
  w.cmd(CMD.ARRAY_DIRECTION, index(0));
  paths.forEach((tp, part) => {
    const power = encodePower(layerPower(tp));
    const b = bounds[part]!;
    w.cmd(CMD.SPEED_LASER_1_PART, index(part), encodeSpeed(tp.feed / 60));
    w.cmd(CMD.MIN_POWER_1_PART, index(part), power);
    w.cmd(CMD.MAX_POWER_1_PART, index(part), power);
    w.cmd(CMD.MIN_POWER_2_PART, index(part), power);
    w.cmd(CMD.MAX_POWER_2_PART, index(part), power);
    w.cmd(
      CMD.LAYER_COLOR_PART,
      index(part),
      encode35(colorValue(settings.layers.get(tp.layerId)?.color ?? '#000000')),
    );
    w.cmd(CMD.WORK_MODE_PART, index(part), index(0));
    w.cmd(CMD.PART_MIN_POINT, index(part), encodeCoord(b.minX), encodeCoord(b.minY));
    w.cmd(CMD.PART_MAX_POINT, index(part), encodeCoord(b.maxX), encodeCoord(b.maxY));
    w.cmd(CMD.PART_MIN_POINT_EX, index(part), encodeCoord(b.minX), encodeCoord(b.minY));
    w.cmd(CMD.PART_MAX_POINT_EX, index(part), encodeCoord(b.maxX), encodeCoord(b.maxY));
  });
  w.cmd(CMD.MAX_LAYER_PART, index(paths.length - 1));
  w.cmd(CMD.PEN_OFFSET, index(0), zero);
  w.cmd(CMD.PEN_OFFSET, index(1), zero);
  w.cmd(CMD.LAYER_OFFSET, index(0), zero);
  w.cmd(CMD.LAYER_OFFSET, index(1), zero);
  w.cmd(CMD.DISPLAY_OFFSET, zero, zero);
  w.cmd(CMD.FEED_INFO, zero);
  w.cmd(CMD.ARRAY_START, index(0));
  w.cmd(CMD.SET_CURRENT_ELEMENT_INDEX, index(0));
  w.cmd(CMD.ARRAY_EN_MIRROR_CUT, index(0));
  w.cmd(CMD.ARRAY_MIN_POINT, encodeCoord(all.minX), encodeCoord(all.minY));
  w.cmd(CMD.ARRAY_MAX_POINT, encodeCoord(all.maxX), encodeCoord(all.maxY));
  w.cmd(CMD.ARRAY_ADD, zero, zero);
  w.cmd(CMD.ARRAY_MIRROR, index(0));
  w.cmd(CMD.ARRAY_REPEAT, ...[1, 1, 0, 1123, -3328, 4, 3480].map(encode14));

  // Body: per layer, its settings, then travels (laser off) and cuts at absolute positions.
  paths.forEach((tp, part) => {
    if (part > 0) {
      w.cmd(CMD.BLOCK_END);
      w.cmd(CMD.LAYER_END);
      w.cmd(CMD.EN_LASER_2_OFFSET_0);
    }
    const power = layerPower(tp);
    w.cmd(CMD.LAYER_NUMBER_PART, index(part));
    w.cmd(CMD.LASER_DEVICE_0);
    w.cmd(settings.airAssist && tp.airAssist ? CMD.AIR_ASSIST_ON : CMD.AIR_ASSIST_OFF);
    w.cmd(CMD.SPEED_LASER_1, encodeSpeed(tp.feed / 60));
    w.cmd(CMD.LASER_ON_DELAY, zero);
    w.cmd(CMD.LASER_OFF_DELAY, zero);
    w.cmd(CMD.MIN_POWER_1, encodePower(power));
    w.cmd(CMD.MAX_POWER_1, encodePower(power));
    w.cmd(CMD.MIN_POWER_2, encodePower(power));
    w.cmd(CMD.MAX_POWER_2, encodePower(power));
    w.cmd(CMD.EN_LASER_TUBE_START, index(1));
    let current = power;
    for (const run of tp.runs) {
      const pts = run.points;
      if (pts.length < 4) continue;
      w.cmd(CMD.MOVE_ABS_XY, encodeCoord(pts[0]!), encodeCoord(pts[1]!));
      for (let i = 2; i + 1 < pts.length; i += 2) {
        const p = segmentPower(run, (i >> 1) - 1);
        const to = [encodeCoord(pts[i]!), encodeCoord(pts[i + 1]!)];
        if (p <= 0) {
          w.cmd(CMD.MOVE_ABS_XY, ...to);
          continue;
        }
        if (p !== current) {
          // Grayscale engraving changes power along a run.
          w.cmd(CMD.MIN_POWER_1, encodePower(p));
          w.cmd(CMD.MAX_POWER_1, encodePower(p));
          current = p;
        }
        w.cmd(CMD.CUT_ABS_XY, ...to);
      }
    }
  });

  w.cmd(CMD.BLOCK_END);
  w.cmd(CMD.LAYER_END);
  w.cmd(CMD.EN_LASER_2_OFFSET_0);
  // The checksum covers everything before it plus the end-of-file byte.
  w.cmd(CMD.SET_FILE_SUM, encode35(w.checksum + CMD.END_OF_FILE[0]));
  w.cmd(CMD.END_OF_FILE);
  return swizzle(Uint8Array.from(w.bytes));
}
