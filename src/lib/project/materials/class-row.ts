/** Rows of the wattage-class tables (diode, CO₂) and how they become presets. */
import type { LayerMode } from '../types';
import type { MaterialOperation, MaterialPreset } from './types';

export type ClassRow = [
  brand: string,
  material: string,
  thicknessMm: number | null,
  operation: MaterialOperation,
  mode: LayerMode,
  /** mm/min */
  speed: number,
  power: number,
  passes: number,
  intervalMm: number | null,
  dpi: number | null,
  airAssist: boolean | null,
  notes: string | null,
  /** Index into the table's sources. */
  source: number,
];

const slug = (s: string) =>
  s
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '');

export function classPresets(
  laser: 'diode' | 'co2',
  watts: number,
  rows: readonly ClassRow[],
  sources: readonly string[],
): MaterialPreset[] {
  return rows.map(
    (
      [
        brand,
        material,
        thicknessMm,
        operation,
        mode,
        speed,
        power,
        passes,
        interval,
        dpi,
        air,
        notes,
        source,
      ],
      i,
    ) => ({
      id: slug(`${laser} ${watts} ${brand} ${material} ${thicknessMm ?? ''} ${operation} ${i}`),
      material,
      ...(thicknessMm ? { thicknessMm } : {}),
      operation,
      machine: { kind: 'class', laser, watts },
      mode,
      power,
      speed,
      passes,
      ...(interval ? { interval } : {}),
      ...(dpi ? { dpi } : {}),
      ...(air !== null ? { airAssist: air } : {}),
      brand,
      ...(notes ? { notes } : {}),
      source: sources[source]!,
    }),
  );
}
