import type { FirmwareName } from '../types';

export type GrblLine =
  | { type: 'empty' }
  | { type: 'ok' }
  /** `code` is 0 when the firmware sent a non-numeric error (GRBL 0.9 style). */
  | { type: 'error'; code: number; text: string }
  | { type: 'alarm'; code: number; text: string }
  | { type: 'status'; body: string }
  | { type: 'welcome'; firmware: FirmwareName; version: string; text: string }
  /** `[TAG:content]`, e.g. MSG, GC, HLP, VER, OPT, echo, G54. */
  | { type: 'feedback'; tag: string; content: string }
  | { type: 'setting'; n: number; value: string }
  | { type: 'unknown'; text: string };

/** Strips control characters and line noise from both ends; printable content is kept as is. */
function cleanEdges(raw: string): string {
  return raw.replace(/^[^\x21-\x7e]+/, '').replace(/[^\x21-\x7e]+$/, '');
}

function parseWelcome(line: string): GrblLine | null {
  const match = /^Grbl(HAL)?\s+(\S+)/i.exec(line);
  if (!match) return null;
  let firmware: FirmwareName = match[1] ? 'grblHAL' : 'grbl';
  let version = match[2];
  const fluid = /FluidNC\s+v?([^\s\]]+)/i.exec(line);
  if (fluid) {
    firmware = 'fluidnc';
    version = fluid[1];
  }
  return { type: 'welcome', firmware, version, text: line };
}

/** Classifies one line from the controller (SPEC §7.2). Never throws. */
export function classifyLine(raw: string): GrblLine {
  const line = cleanEdges(raw);
  if (line === '') return { type: 'empty' };
  if (line === 'ok') return { type: 'ok' };

  const error = /^error:\s*(.*)$/i.exec(line);
  if (error) {
    const code = /^\d+$/.test(error[1]) ? Number(error[1]) : 0;
    return { type: 'error', code, text: line };
  }
  const alarm = /^ALARM:\s*(.*)$/i.exec(line);
  if (alarm) {
    const code = /^\d+$/.test(alarm[1]) ? Number(alarm[1]) : 0;
    return { type: 'alarm', code, text: line };
  }
  if (line.startsWith('<') && line.endsWith('>')) return { type: 'status', body: line.slice(1, -1) };

  const welcome = parseWelcome(line);
  if (welcome) return welcome;

  const feedback = /^\[([A-Za-z0-9.]+):(.*)\]$/.exec(line);
  if (feedback) return { type: 'feedback', tag: feedback[1], content: feedback[2] };

  const setting = /^\$(\d+)=(.*)$/.exec(line);
  if (setting) return { type: 'setting', n: Number(setting[1]), value: setting[2].trim() };

  return { type: 'unknown', text: line };
}

/** `[VER:1.1h.20190825:]` → `1.1h.20190825`. */
export function parseVersionFeedback(content: string): string | null {
  const version = content.split(':')[0]?.trim();
  return version ? version : null;
}

/** `[OPT:V,15,128]` → planner blocks and RX buffer size when present. */
export function parseOptionsFeedback(content: string): {
  flags: string;
  plannerBlocks: number | null;
  rxSize: number | null;
} {
  const [flags = '', blocks, rx] = content.split(',');
  const toInt = (s: string | undefined) => {
    const value = s === undefined ? NaN : Number.parseInt(s, 10);
    return Number.isFinite(value) && value > 0 ? value : null;
  };
  return { flags, plannerBlocks: toInt(blocks), rxSize: toInt(rx) };
}
