/**
 * Ruida controller encoding (RDC644x and kin), ported from MeerK40t's rdjob.py (MIT,
 * https://github.com/meerk40t/meerk40t). Numbers are big-endian groups of 7 bits, so no data byte
 * has its top bit set and command bytes (≥ 0x80) stand out. Whole files and USB/UDP payloads are
 * then "swizzled" byte by byte with a magic number, 0x88 on most controllers.
 */

export const RUIDA_MAGIC = 0x88;

/** 14-bit value in two 7-bit bytes. Negative values wrap (two's complement), as relative moves need. */
export function encode14(v: number): number[] {
  // Fractions truncate, as in the reference implementation.
  const n = Math.trunc(v) & 0x3fff;
  return [(n >> 7) & 0x7f, n & 0x7f];
}

/** 35-bit value in five 7-bit bytes (coordinates in µm, speeds in µm/s, times in µs). */
export function encode35(v: number): number[] {
  let n = Math.trunc(v);
  if (n < 0) n += 2 ** 35;
  const out: number[] = [];
  for (let shift = 28; shift >= 0; shift -= 7) out.push(Math.floor(n / 2 ** shift) & 0x7f);
  return out;
}

export function decode35(bytes: ArrayLike<number>, at = 0): number {
  let n = 0;
  for (let i = 0; i < 5; i++) n = n * 128 + (bytes[at + i]! & 0x7f);
  return n >= 2 ** 34 ? n - 2 ** 35 : n;
}

export function decode14(bytes: ArrayLike<number>, at = 0): number {
  return ((bytes[at]! & 0x7f) << 7) | (bytes[at + 1]! & 0x7f);
}

/** mm → µm coordinate. */
export const encodeCoord = (mm: number) => encode35(mm * 1000);
/** Percent → 14-bit power (16383 = 100 %). */
export const encodePower = (percent: number) => encode14((Math.min(100, Math.max(0, percent)) * 16383) / 100);
/** mm/s → µm/s. */
export const encodeSpeed = (mmPerSecond: number) => encode35(mmPerSecond * 1000);

export function swizzleByte(b: number, magic = RUIDA_MAGIC): number {
  b ^= (b >> 7) & 0xff;
  b ^= (b << 7) & 0xff;
  b ^= (b >> 7) & 0xff;
  b ^= magic;
  return (b + 1) & 0xff;
}

export function unswizzleByte(b: number, magic = RUIDA_MAGIC): number {
  b = (b - 1) & 0xff;
  b ^= magic;
  b ^= (b >> 7) & 0xff;
  b ^= (b << 7) & 0xff;
  b ^= (b >> 7) & 0xff;
  return b;
}

const lut = (fn: (b: number) => number) => Uint8Array.from({ length: 256 }, (_, b) => fn(b));
const SWIZZLE = lut((b) => swizzleByte(b));
const UNSWIZZLE = lut((b) => unswizzleByte(b));

export const swizzle = (data: Uint8Array) => data.map((b) => SWIZZLE[b]!);
export const unswizzle = (data: Uint8Array) => data.map((b) => UNSWIZZLE[b]!);
