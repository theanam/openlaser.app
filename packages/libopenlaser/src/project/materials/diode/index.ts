/**
 * Diode laser presets: published starting settings by optical power class, from the makers' own charts
 * (sources below, fetched 2026-11). No source states pass counts: one pass each. PVC and vinyl are
 * left out on purpose: burning them gives off chlorine gas.
 */
import { classPresets } from '../class-row';
import type { MaterialPreset } from '../types';
import { W5 } from './w5';
import { W10 } from './w10';
import { W20 } from './w20';
import { W40 } from './w40';

const SOURCES = [
  'https://de.xtool.com/pages/material_einstellungen',
  'https://eu.crealityfalcon.com/blogs/crealityfalcon-tutorial/creality-falcon-laser-series-material-settings',
  'https://ortur.net/pages/materials-reference',
  'https://wiki.atomstack.com/en/materials?model=A10prov2#model-A10prov2',
  'https://wiki.atomstack.com/en/materials?model=A20prov2#model-A20prov2',
  'https://wiki.atomstack.com/en/materials?model=A40prov2#model-A40prov2',
  'https://wiki.atomstack.com/en/materials?model=AtomStackKraft#model-AtomStackKraft',
  'https://www.sculpfun.com/blogs/blog/settings-guide',
];

export const DIODE_PRESETS: readonly MaterialPreset[] = [
  ...classPresets('diode', 5, W5, SOURCES),
  ...classPresets('diode', 10, W10, SOURCES),
  ...classPresets('diode', 20, W20, SOURCES),
  ...classPresets('diode', 40, W40, SOURCES),
];
