/**
 * CO₂ laser presets: published starting settings by optical power class, from the makers' own charts
 * (sources below, fetched 2026-11). No source states pass counts: one pass each. PVC and vinyl are
 * left out on purpose: burning them gives off chlorine gas.
 */
import { classPresets } from '../class-row';
import type { MaterialPreset } from '../types';
import { W40 } from './w40';
import { W60 } from './w60';
import { W80 } from './w80';
import { W100 } from './w100';

const SOURCES = [
  'https://aeonlaser.us/blogs/news/co2-laser-settings-for-acrylic',
  'https://bosslaser.com/wp-content/uploads/2024/06/bl2-t83-laser-material-settings_granite-engraving.pdf',
  'https://bosslaser.com/wp-content/uploads/2024/06/bl2-t83-laser-material-settings_leather-cutting.pdf',
  'https://bosslaser.com/wp-content/uploads/2024/06/bl2-t83-laser-material-settings_leather-engraving.pdf',
  'https://bosslaser.com/wp-content/uploads/2024/06/bl2-t83-laser-material-settings_paper-cutting.pdf',
  'https://bosslaser.com/wp-content/uploads/2024/06/bl2-t83-laser-material-settings_powder-coated-metal-engraving.pdf',
  'https://bosslaser.com/wp-content/uploads/2024/06/bl2-t83-laser-material-settings_rubber-cutting.pdf',
  'https://bosslaser.com/wp-content/uploads/2024/06/bl2-t83-laser-material-settings_rubber-engraving.pdf',
  'https://eu.thunderlaser.com/down/parameters-for-different-materials-100watt.pdf',
  'https://eu.thunderlaser.com/down/parameters-for-different-materials-40watt.pdf',
  'https://eu.thunderlaser.com/down/parameters-for-different-materials-60watt.pdf',
  'https://eu.thunderlaser.com/down/parameters-for-different-materials-80watt.pdf',
  'https://omtech.com/blogs/knowledge/material-settings-for-laser-engravers',
  'https://www.thunderlaser.com/laser-settings.html',
];

export const CO2_PRESETS: readonly MaterialPreset[] = [
  ...classPresets('co2', 40, W40, SOURCES),
  ...classPresets('co2', 60, W60, SOURCES),
  ...classPresets('co2', 80, W80, SOURCES),
  ...classPresets('co2', 100, W100, SOURCES),
];
