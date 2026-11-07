/**
 * LaserPecker wire framing. Protocol details from the LaserPecker protocol notes by nerdocs
 * (https://github.com/nerdocs/pyrograph/blob/main/docs/protocol.md). Implemented independently from
 * that description; no code from pyrograph is included.
 *
 * Short frame: AA BB <len> <func> <data…> <sum hi> <sum lo>, where len counts func, data and the
 * two sum bytes, and the sum is func plus every data byte, mod 65536.
 * Long frame (device to host only): AA CC <len, 4 bytes> <payload…> <sum hi> <sum lo>.
 */

export const FRAME_START = 0xaa;
export const SHORT_MARK = 0xbb;
export const LONG_MARK = 0xcc;
/** One length byte holds func + data + 2 sum bytes. */
export const MAX_DATA_BYTES = 0xff - 3;
/** Long frames are file listings; anything this big is line noise. */
const MAX_LONG_PAYLOAD = 1 << 20;

/** 16-bit sum of the bytes, as the frame trailer carries it. */
export function sum16(bytes: ArrayLike<number>, start = 0, end = bytes.length): number {
  let total = 0;
  for (let i = start; i < end; i++) total = (total + bytes[i]) & 0xffff;
  return total;
}

/** Builds a host-to-device frame. */
export function encodeFrame(func: number, data: ArrayLike<number> = []): Uint8Array {
  if (data.length > MAX_DATA_BYTES) throw new RangeError(`Frame data is limited to ${MAX_DATA_BYTES} bytes`);
  const out = new Uint8Array(data.length + 6);
  out[0] = FRAME_START;
  out[1] = SHORT_MARK;
  out[2] = data.length + 3;
  out[3] = func & 0xff;
  out.set(
    Array.from(data, (b) => b & 0xff),
    4,
  );
  const total = sum16(out, 3, 4 + data.length);
  out[4 + data.length] = total >> 8;
  out[5 + data.length] = total & 0xff;
  return out;
}

export interface ShortFrame {
  kind: 'short';
  func: number;
  /** The whole frame, header and sum included, so replies can be read at the device's offsets. */
  bytes: Uint8Array;
}

export interface LongFrame {
  kind: 'long';
  /** Payload only, without header or sum. */
  payload: Uint8Array;
}

export type DeviceFrame = ShortFrame | LongFrame;

/**
 * Cuts the device's byte stream into frames. Replies can arrive split over several reads or BLE
 * notifications, or several in one; bytes that do not form a valid frame are skipped one at a time
 * until the stream lines up again.
 */
export class FrameReader {
  private buffer = new Uint8Array(0);
  /** Bytes dropped while resynchronising, for diagnostics. */
  skipped = 0;

  push(chunk: Uint8Array): DeviceFrame[] {
    const merged = new Uint8Array(this.buffer.length + chunk.length);
    merged.set(this.buffer);
    merged.set(chunk, this.buffer.length);
    this.buffer = merged;
    const frames: DeviceFrame[] = [];
    let at = 0;
    while (at < this.buffer.length) {
      const result = this.readAt(at);
      if (result === 'need-more') break;
      if (result === 'invalid') {
        at++;
        this.skipped++;
        continue;
      }
      frames.push(result.frame);
      at += result.size;
    }
    this.buffer = this.buffer.slice(at);
    return frames;
  }

  reset(): void {
    this.buffer = new Uint8Array(0);
  }

  private readAt(at: number): { frame: DeviceFrame; size: number } | 'need-more' | 'invalid' {
    const b = this.buffer;
    const left = b.length - at;
    if (b[at] !== FRAME_START) return 'invalid';
    if (left < 2) return 'need-more';
    if (b[at + 1] === SHORT_MARK) {
      if (left < 3) return 'need-more';
      const len = b[at + 2];
      if (len < 3) return 'invalid';
      const size = len + 3;
      if (left < size) return 'need-more';
      const expected = (b[at + size - 2] << 8) | b[at + size - 1];
      if (sum16(b, at + 3, at + size - 2) !== expected) return 'invalid';
      const bytes = b.slice(at, at + size);
      return { frame: { kind: 'short', func: bytes[3], bytes }, size };
    }
    if (b[at + 1] === LONG_MARK) {
      if (left < 6) return 'need-more';
      const len = ((b[at + 2] << 24) | (b[at + 3] << 16) | (b[at + 4] << 8) | b[at + 5]) >>> 0;
      if (len < 2 || len > MAX_LONG_PAYLOAD) return 'invalid';
      const size = len + 6;
      if (left < size) return 'need-more';
      const expected = (b[at + size - 2] << 8) | b[at + size - 1];
      if (sum16(b, at + 6, at + size - 2) !== expected) return 'invalid';
      return { frame: { kind: 'long', payload: b.slice(at + 6, at + size - 2) }, size };
    }
    return 'invalid';
  }
}
