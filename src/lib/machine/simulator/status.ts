import type { Vec3 } from '../types';
import type { SimulatorStatus } from './system-commands';

export interface Overrides {
  feed: number;
  rapid: number;
  spindle: number;
}

export function defaultOverrides(): Overrides {
  return { feed: 100, rapid: 100, spindle: 100 };
}

const clampPercent = (value: number) => Math.min(200, Math.max(10, value));

/** Applies a feed/rapid/spindle override byte; null if the byte is not an override. */
export function applyOverrideByte(current: Overrides, byte: number): Overrides | null {
  switch (byte) {
    case 0x90:
      return { ...current, feed: 100 };
    case 0x91:
      return { ...current, feed: clampPercent(current.feed + 10) };
    case 0x92:
      return { ...current, feed: clampPercent(current.feed - 10) };
    case 0x93:
      return { ...current, feed: clampPercent(current.feed + 1) };
    case 0x94:
      return { ...current, feed: clampPercent(current.feed - 1) };
    case 0x95:
      return { ...current, rapid: 100 };
    case 0x96:
      return { ...current, rapid: 50 };
    case 0x97:
      return { ...current, rapid: 25 };
    case 0x99:
      return { ...current, spindle: 100 };
    case 0x9a:
      return { ...current, spindle: clampPercent(current.spindle + 10) };
    case 0x9b:
      return { ...current, spindle: clampPercent(current.spindle - 10) };
    case 0x9c:
      return { ...current, spindle: clampPercent(current.spindle + 1) };
    case 0x9d:
      return { ...current, spindle: clampPercent(current.spindle - 1) };
    default:
      return null;
  }
}

export interface StatusSnapshot {
  status: SimulatorStatus;
  subState: number | null;
  mpos: Vec3;
  workOffset: Vec3;
  /** $10 bit 0: MPos when set, WPos otherwise. */
  reportMachinePosition: boolean;
  /** $10 bit 1: include Bf. */
  buffer: { plannerFree: number; rxFree: number } | null;
  feed: number;
  spindle: number;
  includeWorkOffset: boolean;
  overrides: Overrides | null;
}

const xyz = (v: Vec3) => `${v.x.toFixed(3)},${v.y.toFixed(3)},${v.z.toFixed(3)}`;

/** `<Idle|MPos:0.000,0.000,0.000|Bf:15,128|FS:0,0|WCO:0.000,0.000,0.000>` in GRBL field order. */
export function formatStatusReport(s: StatusSnapshot): string {
  const fields = [s.subState === null ? s.status : `${s.status}:${s.subState}`];
  if (s.reportMachinePosition) {
    fields.push(`MPos:${xyz(s.mpos)}`);
  } else {
    const w = s.workOffset;
    fields.push(`WPos:${xyz({ x: s.mpos.x - w.x, y: s.mpos.y - w.y, z: s.mpos.z - w.z })}`);
  }
  if (s.buffer) fields.push(`Bf:${s.buffer.plannerFree},${s.buffer.rxFree}`);
  fields.push(`FS:${Math.round(s.feed)},${Math.round(s.spindle)}`);
  if (s.includeWorkOffset) fields.push(`WCO:${xyz(s.workOffset)}`);
  else if (s.overrides) fields.push(`Ov:${s.overrides.feed},${s.overrides.rapid},${s.overrides.spindle}`);
  return `<${fields.join('|')}>`;
}
