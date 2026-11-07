import type { RealtimeCommand } from '../types';

/** Single-byte realtime commands (SPEC §7.2). Never counted against the RX buffer. */
export const REALTIME_BYTES: Readonly<Record<RealtimeCommand, number>> = {
  status: 0x3f, // '?'
  'cycle-start': 0x7e, // '~'
  'feed-hold': 0x21, // '!'
  'soft-reset': 0x18,
  'safety-door': 0x84,
  'jog-cancel': 0x85,
  'feed-100': 0x90,
  'feed+10': 0x91,
  'feed-10': 0x92,
  'feed+1': 0x93,
  'feed-1': 0x94,
  'rapid-100': 0x95,
  'rapid-50': 0x96,
  'rapid-25': 0x97,
  'spindle-100': 0x99,
  'spindle+10': 0x9a,
  'spindle-10': 0x9b,
  'spindle+1': 0x9c,
  'spindle-1': 0x9d,
  'spindle-stop': 0x9e,
  'flood-toggle': 0xa0,
};

const COMMAND_BY_BYTE = new Map<number, RealtimeCommand>(
  (Object.entries(REALTIME_BYTES) as [RealtimeCommand, number][]).map(([cmd, byte]) => [byte, cmd]),
);

export function realtimeCommandForByte(byte: number): RealtimeCommand | undefined {
  return COMMAND_BY_BYTE.get(byte);
}

/** GRBL intercepts these bytes anywhere in the stream, even inside a line. */
export function isRealtimeByte(byte: number): boolean {
  return byte === 0x3f || byte === 0x7e || byte === 0x21 || byte === 0x18 || byte >= 0x80;
}
