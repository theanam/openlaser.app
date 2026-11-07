import type { MachineStatus, Vec3 } from '../types';

/** Fields of one `<...>` status report. Absent fields are undefined. */
export interface StatusReport {
  status: MachineStatus;
  subState: number | null;
  mpos?: Vec3;
  wpos?: Vec3;
  wco?: Vec3;
  feed?: number;
  spindle?: number;
  overrides?: { feed: number; rapid: number; spindle: number };
  buffer?: { plannerFree: number; rxFree: number };
  /** Input pins currently triggered, e.g. "XYP". */
  pins?: string;
  lineNumber?: number;
}

const STATUSES: readonly MachineStatus[] = [
  'Idle',
  'Run',
  'Hold',
  'Jog',
  'Alarm',
  'Door',
  'Check',
  'Home',
  'Sleep',
];

function parseNumbers(text: string): number[] | null {
  const values = text.split(',').map((v) => Number.parseFloat(v));
  return values.every(Number.isFinite) ? values : null;
}

/** Machines with 3–6 axes report that many values; we use the first three (missing Z = 0). */
function parseVec3(text: string): Vec3 | undefined {
  const values = parseNumbers(text);
  if (!values || values.length < 2) return undefined;
  return { x: values[0], y: values[1], z: values[2] ?? 0 };
}

function parseState(field: string): { status: MachineStatus; subState: number | null } {
  const [name, sub] = field.split(':');
  const status = STATUSES.find((s) => s === name) ?? 'Unknown';
  const subState = sub !== undefined && /^\d+$/.test(sub) ? Number(sub) : null;
  return { status, subState };
}

/** Parses the body of a status report (without `<` `>`). Unknown fields are ignored. */
export function parseStatusReport(body: string): StatusReport {
  const [stateField = '', ...fields] = body.split('|');
  const report: StatusReport = parseState(stateField);

  for (const field of fields) {
    const colon = field.indexOf(':');
    if (colon < 0) continue;
    const key = field.slice(0, colon);
    const value = field.slice(colon + 1);
    switch (key) {
      case 'MPos':
        report.mpos = parseVec3(value);
        break;
      case 'WPos':
        report.wpos = parseVec3(value);
        break;
      case 'WCO':
        report.wco = parseVec3(value);
        break;
      case 'FS': {
        const fs = parseNumbers(value);
        if (fs && fs.length >= 1) report.feed = fs[0];
        if (fs && fs.length >= 2) report.spindle = fs[1];
        break;
      }
      case 'F': {
        const f = Number.parseFloat(value);
        if (Number.isFinite(f)) report.feed = f;
        break;
      }
      case 'Ov': {
        const ov = parseNumbers(value);
        if (ov && ov.length >= 3) report.overrides = { feed: ov[0], rapid: ov[1], spindle: ov[2] };
        break;
      }
      case 'Bf': {
        const bf = parseNumbers(value);
        if (bf && bf.length >= 2) report.buffer = { plannerFree: bf[0], rxFree: bf[1] };
        break;
      }
      case 'Pn':
        report.pins = value;
        break;
      case 'Ln': {
        const ln = Number.parseInt(value, 10);
        if (Number.isFinite(ln)) report.lineNumber = ln;
        break;
      }
      default:
        break;
    }
  }
  return report;
}

export interface ResolvedPositions {
  mpos: Vec3 | null;
  wpos: Vec3 | null;
  wco: Vec3 | null;
}

/**
 * Fills in whichever of MPos/WPos the report omitted using the cached work coordinate offset.
 * Until a WCO has been seen, the offset is assumed to be zero (wco stays null).
 */
export function resolvePositions(report: StatusReport, cachedWco: Vec3 | null): ResolvedPositions {
  const wco = report.wco ?? cachedWco;
  const offset = wco ?? { x: 0, y: 0, z: 0 };
  if (report.mpos) {
    const m = report.mpos;
    return { mpos: m, wpos: { x: m.x - offset.x, y: m.y - offset.y, z: m.z - offset.z }, wco };
  }
  if (report.wpos) {
    const w = report.wpos;
    return { mpos: { x: w.x + offset.x, y: w.y + offset.y, z: w.z + offset.z }, wpos: w, wco };
  }
  return { mpos: null, wpos: null, wco };
}
