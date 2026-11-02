/**
 * LaserPecker's own "Recommended Starting Laser Settings" tables, per model (fetched 2026-11 from
 * ca.laserpecker.net/pages/material-settings-lp2 … lp5, the same tables as LaserPecker's PDFs).
 * Depth is LaserPecker's 1–100 burn depth. The tables give no pass counts: one pass each. LP5
 * rows are the 150 mm focal length column.
 */
import { speedFromDepth } from '../../depth';
import type { MaterialPreset } from '../types';
import { LP2_ROWS } from './lp2';
import { LP3_ROWS } from './lp3';
import { LP4_ROWS } from './lp4';
import { LP5_ROWS } from './lp5';
import type { Row } from './row';

const SOURCE: Record<string, string> = {
  LP2: 'https://ca.laserpecker.net/pages/material-settings-lp2',
  LP3: 'https://ca.laserpecker.net/pages/material-settings-lp3',
  LP4: 'https://ca.laserpecker.net/pages/material-settings-lp4',
  LP5: 'https://ca.laserpecker.net/pages/material-settings-lp5',
};

const slug = (s: string) =>
  s
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '');

const ROWS: Row[] = [...LP2_ROWS, ...LP3_ROWS, ...LP4_ROWS, ...LP5_ROWS];

export const LASERPECKER_PRESETS: readonly MaterialPreset[] = ROWS.map(
  ([model, wavelength, material, thicknessMm, operation, mode, resolution, power, depth, frequency]) => ({
    id: slug(
      ['lp', model, wavelength, material, thicknessMm ?? '', mode, operation, resolution ?? ''].join(' '),
    ),
    material,
    ...(thicknessMm ? { thicknessMm } : {}),
    operation,
    machine: { kind: 'model', model: `LaserPecker ${model}` },
    wavelength,
    mode,
    ...(resolution ? { resolution } : {}),
    power,
    speed: speedFromDepth(depth),
    passes: 1,
    ...(frequency ? { notes: `Pulse frequency ${frequency} kHz` } : {}),
    source: SOURCE[model]!,
  }),
);
