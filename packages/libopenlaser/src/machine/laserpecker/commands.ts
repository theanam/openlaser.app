/**
 * Command builders for LaserPecker engravers. Protocol details from the LaserPecker protocol notes
 * by nerdocs (https://github.com/nerdocs/pyrograph/blob/main/docs/protocol.md). Implemented
 * independently from that description; no code from pyrograph is included.
 *
 * Multi-byte fields are big-endian. Lengths are mm; the device takes 0.1 mm for previews and
 * pixels at the job's resolution for engraving positions.
 */
import { encodeFrame } from './frame';

export const Func = {
  query: 0x00,
  print: 0x01,
  preview: 0x02,
  file: 0x05,
  settings: 0x06,
  exit: 0xff,
} as const;

export const Query = {
  status: 0,
  fileIds: 1,
  settings: 2,
  version: 3,
} as const;

export const PrintState = {
  start: 1,
  resume: 2,
  stop: 3,
  pause: 4,
} as const;

export const PreviewState = {
  rectangle: 2,
  stop: 3,
  /** The rectangle traced while the rotary turns the object. */
  rotary: 5,
} as const;

/** Where the device keeps an uploaded file. */
export const Storage = { usbStick: 0, sdCard: 1 } as const;

/** Lowest preview power: framing never burns. */
export const FRAME_POWER = 1;

function u16(value: number): number[] {
  const v = Math.max(0, Math.min(0xffff, Math.round(value)));
  return [v >> 8, v & 0xff];
}

function u32(value: number): number[] {
  const v = value >>> 0;
  return [(v >>> 24) & 0xff, (v >>> 16) & 0xff, (v >>> 8) & 0xff, v & 0xff];
}

const clamp = (v: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, Math.round(v)));

export function queryCommand(state: number): Uint8Array {
  return encodeFrame(Func.query, [state, 0, 0, 0, 0]);
}

/** Leaves whatever mode the device is in. Sent before uploads and as part of Stop. */
export function exitCommand(): Uint8Array {
  return encodeFrame(Func.exit, [0, 0, 0, 0, 0]);
}

export interface PrintJob {
  fileId: number;
  /** Percent, 1–100. */
  power: number;
  /** Burn depth, 1–100; the device takes 101 − depth. */
  depth: number;
  /** Job position in pixels at the file's resolution. */
  x: number;
  y: number;
  /** Repeat count, 1–255. */
  passes: number;
  /** Which laser fires on dual-laser models: 0 blue (450 nm), 1 infrared (1064 nm). */
  laserType?: number;
  /** mm, of the object on a rotary; 0 on the flat bed. */
  objectDiameter?: number;
  /** kHz, pulse rate of a fiber (infrared) laser; 0 leaves it to the laser. */
  frequency?: number;
}

/** 23 data bytes: state, power, depth, file id, position, repeats, then fields left at 0. */
export function printStartCommand(job: PrintJob): Uint8Array {
  const data = [
    PrintState.start,
    clamp(job.power, 1, 100),
    101 - clamp(job.depth, 1, 100),
    ...u32(job.fileId),
    ...u16(job.x),
    ...u16(job.y),
    0, // tag
    clamp(job.passes, 1, 255),
    clamp(job.laserType ?? 0, 0, 1),
    ...u16((job.objectDiameter ?? 0) * 100),
    0, // acceleration class
    0, // fan
    clamp(job.frequency ?? 0, 0, 255),
    ...u16(0), // speed: depth decides
    Storage.sdCard,
    0,
  ];
  return encodeFrame(Func.print, data);
}

/** Pause, resume and stop carry only the state. */
export function printControlCommand(state: (typeof PrintState)['resume' | 'pause' | 'stop']): Uint8Array {
  return encodeFrame(Func.print, [state, ...new Array<number>(22).fill(0)]);
}

export interface PreviewRect {
  /** mm, top-left corner on the device's work area. */
  x: number;
  y: number;
  width: number;
  height: number;
}

/**
 * Traces a rectangle with the beam until stopped. With an object diameter the rotary turns the
 * object through the rectangle.
 */
export function previewRectCommand(
  rect: PreviewRect,
  px: number,
  objectDiameter = 0,
  power = FRAME_POWER,
): Uint8Array {
  return encodeFrame(Func.preview, [
    objectDiameter > 0 ? PreviewState.rotary : PreviewState.rectangle,
    ...u16(rect.width * 10),
    ...u16(rect.height * 10),
    ...u16(rect.x * 10),
    ...u16(rect.y * 10),
    0,
    px,
    clamp(power, 1, 100),
    ...u16(objectDiameter * 100),
  ]);
}

export function previewStopCommand(): Uint8Array {
  return encodeFrame(Func.preview, [PreviewState.stop, ...new Array<number>(13).fill(0)]);
}

/** Announces a raw transfer of `totalBytes` (the 64-byte header counts). */
export function announceFileCommand(totalBytes: number): Uint8Array {
  return encodeFrame(Func.file, [1, ...u32(totalBytes), 0]);
}

/** Offsets of the accessory flags in the settings reply. */
const SETTING_ROTARY = 15;
const SETTING_SLIDE = 16;

/**
 * Settings write that switches the rotary or slide flag and keeps every other setting as the
 * device reported it (query 2, fields from offset 4).
 */
export function settingsWithAccessory(read: Uint8Array, accessory: 'rotary' | 'slide' | null): Uint8Array {
  const at = (offset: number) => (offset < read.length - 2 ? read[offset] : 0);
  const reply = Array.from({ length: 20 }, (_, i) => at(4 + i));
  reply[SETTING_ROTARY - 4] = accessory === 'rotary' ? 1 : 0;
  reply[SETTING_SLIDE - 4] = accessory === 'slide' ? 1 : 0;
  // Write order: a leading 1, then the reply's fields with its two unused slots sent as 0. The
  // Z direction is written as 0 when the device reports 2.
  const [
    free,
    buzzer,
    view,
    gView,
    ,
    ,
    zFlag,
    zDir,
    keyView,
    irDst,
    keyPrint,
    rFlag,
    sFlag,
    dir,
    gPwr,
    sRep,
    carFlag,
    printDir,
    ,
    overscan,
  ] = reply;
  return encodeFrame(Func.settings, [
    1,
    free,
    buzzer,
    view,
    gView,
    0,
    zFlag,
    zDir === 2 ? 0 : zDir,
    keyView,
    irDst,
    keyPrint,
    rFlag,
    sFlag,
    dir,
    gPwr,
    sRep,
    carFlag,
    printDir,
    0,
    overscan,
  ]);
}

/** The accessory the settings reply says is on, if any. */
export function accessoryInSettings(read: Uint8Array): 'rotary' | 'slide' | null {
  const at = (offset: number) => (offset < read.length - 2 ? read[offset] : 0);
  return at(SETTING_ROTARY) ? 'rotary' : at(SETTING_SLIDE) ? 'slide' : null;
}
