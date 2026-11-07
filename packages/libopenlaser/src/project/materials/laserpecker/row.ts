import type { LayerMode } from '../../types';
import type { MaterialOperation } from '../types';

/** One line of a LaserPecker settings table. */
export type Row = [
  model: string,
  wavelength: number,
  material: string,
  thicknessMm: number | null,
  operation: MaterialOperation,
  mode: LayerMode,
  resolution: string | null,
  power: number,
  depth: number,
  frequencyKHz: number | null,
];
