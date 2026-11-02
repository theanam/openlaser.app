/** Ruida DSP controllers (most CO₂ machines): jobs export as .rd files and start on the laser. */
import StateBadge from '../../machine/StateBadge.svelte';
import type { MachineAdapter } from '../types';
import RuidaPanel from './RuidaPanel.svelte';
import { exportRuida } from './export';

export const ruidaAdapter: MachineAdapter = {
  id: 'ruida',
  label: 'Ruida',
  tag: 'Ruida',
  profileDefaults: { originCorner: 'tr' },
  capabilities: { jobOrigin: false, console: false, gcode: false, scanSettings: true },
  exportLabel: 'Export .rd',
  exportJob: exportRuida,
  live: null,
  badge: StateBadge,
  panel: RuidaPanel,
};
