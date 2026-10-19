/**
 * ASCII DXF reader: group-code pairs → records, split into the sections openlaser uses (header
 * units, layer table, block definitions, model-space entities).
 */
import type { Vec2 } from '../../geometry/types';

/** One `0 <TYPE>` record and the group codes that follow it, in file order. */
export interface DxfRecord {
  type: string;
  codes: Array<[number, string]>;
  /** VERTEX records of a POLYLINE, ATTRIB records of an INSERT. */
  children?: DxfRecord[];
}

export interface DxfLayer {
  color: string | null;
  /** Off (negative color) or frozen. */
  hidden: boolean;
}

export interface DxfBlock {
  base: Vec2;
  entities: DxfRecord[];
}

export interface DxfDocument {
  /** $INSUNITS, 0 when the drawing leaves units unset. */
  insUnits: number;
  layers: Map<string, DxfLayer>;
  blocks: Map<string, DxfBlock>;
  entities: DxfRecord[];
}

export class DxfError extends Error {}

export function text(rec: DxfRecord, code: number): string | undefined {
  return rec.codes.find(([c]) => c === code)?.[1];
}

export function num(rec: DxfRecord, code: number, fallback = 0): number {
  const value = text(rec, code);
  const n = value === undefined ? NaN : Number(value);
  return Number.isFinite(n) ? n : fallback;
}

export function nums(rec: DxfRecord, code: number): number[] {
  return rec.codes.filter(([c]) => c === code).map(([, v]) => Number(v));
}

function toRecords(source: string): DxfRecord[] {
  if (source.startsWith('AutoCAD Binary DXF')) {
    throw new DxfError('Binary DXF files are unsupported. Save the drawing as ASCII DXF.');
  }
  const lines = source.split(/\r\n|\r|\n/);
  const records: DxfRecord[] = [];
  let current: DxfRecord | null = null;
  for (let i = 0; i + 1 < lines.length; i += 2) {
    const raw = lines[i]!.trim();
    if (raw === '' && i + 2 >= lines.length) break;
    const code = Number(raw);
    if (!Number.isInteger(code)) throw new DxfError('The file is unreadable as DXF.');
    const value = lines[i + 1]!.trim();
    if (code === 0) {
      current = { type: value.toUpperCase(), codes: [] };
      records.push(current);
    } else if (current) current.codes.push([code, value]);
  }
  if (!records.some((r) => r.type === 'SECTION')) throw new DxfError('The file is unreadable as DXF.');
  return records;
}

/** POLYLINE and attributed INSERT records own the records up to their SEQEND. */
function nest(records: DxfRecord[]): DxfRecord[] {
  const out: DxfRecord[] = [];
  for (let i = 0; i < records.length; i++) {
    const rec = records[i]!;
    const owns = rec.type === 'POLYLINE' || (rec.type === 'INSERT' && num(rec, 66) === 1);
    if (owns) {
      const children: DxfRecord[] = [];
      while (i + 1 < records.length && records[i + 1]!.type !== 'SEQEND') {
        const next = records[i + 1]!;
        if (next.type !== 'VERTEX' && next.type !== 'ATTRIB') break;
        children.push(next);
        i++;
      }
      if (records[i + 1]?.type === 'SEQEND') i++;
      out.push({ ...rec, children });
    } else out.push(rec);
  }
  return out;
}

function headerUnits(section: DxfRecord): number {
  const at = section.codes.findIndex(([c, v]) => c === 9 && v === '$INSUNITS');
  if (at < 0) return 0;
  const value = section.codes[at + 1];
  return value?.[0] === 70 ? Number(value[1]) || 0 : 0;
}

export function readDxf(source: string): DxfDocument {
  const records = toRecords(source);
  const doc: DxfDocument = { insUnits: 0, layers: new Map(), blocks: new Map(), entities: [] };
  let section = '';
  let block: { name: string; block: DxfBlock } | null = null;
  const body: DxfRecord[] = [];

  for (const rec of records) {
    if (rec.type === 'SECTION') {
      section = text(rec, 2)?.toUpperCase() ?? '';
      if (section === 'HEADER') doc.insUnits = headerUnits(rec);
      continue;
    }
    if (rec.type === 'ENDSEC') {
      section = '';
      continue;
    }
    if (section === 'TABLES' && rec.type === 'LAYER') {
      const color = num(rec, 62, 7);
      const trueColor = text(rec, 420);
      doc.layers.set(text(rec, 2) ?? '0', {
        color: trueColor ? hexOf(Number(trueColor)) : aciColor(Math.abs(color)),
        hidden: color < 0 || (num(rec, 70) & 1) === 1,
      });
    } else if (section === 'BLOCKS') {
      if (rec.type === 'BLOCK') {
        block = {
          name: text(rec, 2) ?? '',
          block: { base: { x: num(rec, 10), y: num(rec, 20) }, entities: [] },
        };
        body.length = 0;
      } else if (rec.type === 'ENDBLK') {
        if (block) doc.blocks.set(block.name, { ...block.block, entities: nest([...body]) });
        block = null;
      } else if (block) body.push(rec);
    } else if (section === 'ENTITIES') doc.entities.push(rec);
  }
  doc.entities = nest(doc.entities);
  return doc;
}

export function hexOf(rgb: number): string {
  return `#${(rgb & 0xffffff).toString(16).padStart(6, '0')}`;
}

const BASE_COLORS = [
  '#000000',
  '#ff0000',
  '#ffff00',
  '#00ff00',
  '#00ffff',
  '#0000ff',
  '#ff00ff',
  // 7 is white on dark CAD screens, black on paper and material.
  '#000000',
  '#414141',
  '#808080',
];
const GRAYS = [0x33, 0x50, 0x69, 0x82, 0xbe, 0xff];
const VALUES = [1, 0.74, 0.51, 0.41, 0.31];

/** AutoCAD Color Index → `#rrggbb`. 1–9 are named colors, 10–249 a hue wheel, 250–255 grays. */
export function aciColor(index: number): string | null {
  if (!Number.isInteger(index) || index < 1 || index > 255) return null;
  if (index < 10) return BASE_COLORS[index]!;
  if (index >= 250) {
    const g = GRAYS[index - 250]!;
    return hexOf((g << 16) | (g << 8) | g);
  }
  const hue = (Math.floor(index / 10) - 1) * 15;
  const sub = index % 10;
  const v = VALUES[Math.floor(sub / 2)]!;
  const s = sub % 2 === 0 ? 1 : 0.5;
  const f = (n: number) => {
    const k = (n + hue / 60) % 6;
    return Math.round(255 * (v - v * s * Math.max(0, Math.min(k, 4 - k, 1))));
  };
  return hexOf((f(5) << 16) | (f(3) << 8) | f(1));
}
