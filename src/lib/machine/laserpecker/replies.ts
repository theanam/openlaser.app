/**
 * Reading LaserPecker replies. Protocol details from the LaserPecker protocol notes by nerdocs
 * (https://github.com/nerdocs/pyrograph/blob/main/docs/protocol.md). Implemented independently from
 * that description; no code from pyrograph is included.
 *
 * Offsets count from the frame's first byte (0xAA), so byte 3 is the function code. Fields past
 * the end of a short reply (older firmware sends fewer) read as null.
 */
import { Func } from './commands';

export type DeviceMode = 'engraving' | 'framing' | 'error' | 'idle' | 'unknown';

export interface DeviceStatus {
  mode: DeviceMode;
  /** The raw mode and sub-state bytes, for the console. */
  modeByte: number;
  subState: number;
  /** Percent of the running job. */
  progress: number;
  power: number;
  errorCode: number;
  fileId: number;
  temperature: number | null;
  passesDone: number | null;
  /** 1 Bluetooth only, 2 USB plugged in. */
  link: number | null;
}

/** Bytes before the trailing sum; reads past them return null. */
function field(bytes: Uint8Array, offset: number): number | null {
  return offset < bytes.length - 2 ? bytes[offset] : null;
}

function u32At(bytes: Uint8Array, offset: number): number {
  return (
    ((bytes[offset] << 24) | (bytes[offset + 1] << 16) | (bytes[offset + 2] << 8) | bytes[offset + 3]) >>> 0
  );
}

function modeOf(byte: number): DeviceMode {
  switch (byte) {
    case 1:
      return 'engraving';
    case 2:
      return 'framing';
    case 5:
      return 'error';
    case 6:
      return 'idle';
    default:
      return 'unknown';
  }
}

/** Status reply (query 0). Null when the frame is too short to be one. */
export function parseStatus(bytes: Uint8Array): DeviceStatus | null {
  if (bytes[3] !== Func.query || bytes.length < 17) return null;
  return {
    mode: modeOf(bytes[4]),
    modeByte: bytes[4],
    subState: bytes[5],
    progress: Math.min(100, bytes[6]),
    power: bytes[7],
    errorCode: bytes[9],
    fileId: u32At(bytes, 11),
    temperature: field(bytes, 15),
    passesDone: field(bytes, 18),
    link: field(bytes, 24),
  };
}

/** A job is over once the device is idle again, unless the sub-state says it is still busy. */
export function jobFinished(status: DeviceStatus): boolean {
  return status.mode === 'idle' && status.subState !== 4;
}

export interface DeviceVersion {
  /** e.g. 316 for firmware 3.16. */
  software: number;
  hardware: string;
}

export function parseVersion(bytes: Uint8Array): DeviceVersion | null {
  if (bytes[3] !== Func.query || bytes.length < 12) return null;
  const hardware = Array.from(bytes.slice(6, 10), (b) => b.toString(16).padStart(2, '0')).join(' ');
  return { software: (bytes[4] << 8) | bytes[5], hardware };
}

/** File ids stored on the device (query 1): a count, then 4 bytes per id. */
export function parseFileIds(bytes: Uint8Array): number[] | null {
  if (bytes[3] !== Func.query || bytes.length < 7) return null;
  const count = bytes[4];
  const ids: number[] = [];
  for (let i = 0; i < count && 5 + i * 4 + 4 <= bytes.length - 2; i++) ids.push(u32At(bytes, 5 + i * 4));
  return ids;
}

export type FileReply = { kind: 'ready' | 'stored' | 'refused' | 'other' };

/**
 * Replies around a transfer. `refused` is a device stuck refusing transfers: it answers the
 * announcement with the exit function code instead of the file one, and only a power cycle clears it.
 */
export function parseFileReply(bytes: Uint8Array): FileReply {
  if (bytes[3] === Func.exit && bytes[4] === 1) return { kind: 'refused' };
  if (bytes[3] !== Func.file || bytes.length < 8) return { kind: 'other' };
  if (bytes[5] !== 1) return { kind: 'other' };
  if (bytes[4] === 1) return { kind: 'ready' };
  if (bytes[4] === 2) return { kind: 'stored' };
  return { kind: 'other' };
}

/** Short messages for the device's error codes. */
const ERRORS: Record<number, string> = {
  1: 'Not level or not in a safe state',
  2: 'Job is larger than the work area',
  3: 'Laser too hot',
  4: 'Laser moved during the job',
  5: 'Beam blocked during the job',
  6: 'Job data was rejected',
  7: 'Stored file not found',
  8: 'Tilt sensor fault',
  9: 'Memory fault',
  10: 'Image is out of range',
  11: 'Flame detected',
  12: 'Storage is full',
  13: 'Too many files with this name',
};

export function errorText(code: number): string {
  return ERRORS[code] ?? `Device error ${code}`;
}

export function hex(bytes: Uint8Array): string {
  return Array.from(bytes, (b) => b.toString(16).padStart(2, '0')).join(' ');
}
