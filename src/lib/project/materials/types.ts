/** Material presets: published starting settings for a material on a kind of machine. */
import type { LayerMode } from '../types';

export type MaterialOperation = 'engrave' | 'cut';

/** Which machines a preset is for: one model, or a class of laser at a given optical power. */
export type PresetMachine =
  { kind: 'model'; model: string } | { kind: 'class'; laser: 'diode' | 'co2' | 'fiber'; watts: number };

export interface MaterialPreset {
  /** Stable, for remembering which preset a layer uses. */
  id: string;
  material: string;
  thicknessMm?: number;
  operation: MaterialOperation;
  machine: PresetMachine;
  /** On two-laser machines: which one (matched against the profile's laser wavelengths). */
  wavelength?: number;
  /** How the layer burns it: engraving fills or images, cutting lines. */
  mode: LayerMode;
  /** Percent. */
  power: number;
  /** mm/min (LaserPecker depth is converted on the way in). */
  speed: number;
  passes: number;
  /** Fill line spacing, mm. */
  interval?: number;
  /** Image line density. */
  dpi?: number;
  /** LaserPecker resolution step the numbers were measured at (1K, 1.3K, 2K, 4K). */
  resolution?: string;
  airAssist?: boolean;
  notes?: string;
  /** Who published them, when the table mixes makers. */
  brand?: string;
  /** Where the numbers come from. */
  source: string;
}
