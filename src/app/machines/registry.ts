/**
 * Every machine openlaser can drive, one adapter per controller. Adding a machine adds one line
 * here (see docs/adding-a-machine.md). The first adapter is the default for profiles whose
 * controller is unknown.
 */
import type { MachineProfile } from 'libopenlaser/project';
import { profiles } from '../state/profiles.svelte';
import { grblAdapter } from './grbl';
import { laserPeckerAdapter } from './laserpecker';
import { ruidaAdapter } from './ruida';
import type { LiveMachine, MachineAdapter, MachineSession } from './types';

export const ADAPTERS: readonly MachineAdapter[] = [grblAdapter, ruidaAdapter, laserPeckerAdapter];

export const DEFAULT_ADAPTER = ADAPTERS[0];

/** Ids a profile may name as its controller. */
export const CONTROLLER_IDS: readonly string[] = ADAPTERS.map((a) => a.id);

export function adapterFor(id: string | undefined): MachineAdapter {
  return ADAPTERS.find((a) => a.id === id) ?? DEFAULT_ADAPTER;
}

/** The adapter of the selected machine profile. */
export function activeAdapter(): MachineAdapter {
  return adapterFor(profiles.active.controller);
}

/** The adapter with a live connection open, if any. */
export function connectedAdapter(): (MachineAdapter & { live: LiveMachine }) | null {
  const found = ADAPTERS.find((a) => a.live?.session.connected);
  return found?.live ? (found as MachineAdapter & { live: LiveMachine }) : null;
}

export function connectedSession(): MachineSession | null {
  return connectedAdapter()?.live.session ?? null;
}

/** What the Machine panel shows: the connected machine, else the selected one. */
export function shownAdapter(): MachineAdapter {
  return connectedAdapter() ?? activeAdapter();
}

/** "CO₂", "CO₂ · Ruida", or nothing for diode GRBL machines: a tag beside the machine name. */
export function machineKind(m: Partial<Pick<MachineProfile, 'laserType' | 'controller'>>): string {
  return [m.laserType === 'co2' ? 'CO₂' : '', adapterFor(m.controller).tag].filter(Boolean).join(' · ');
}
