/** GRBL, grblHAL and FluidNC lasers over USB serial: the existing driver, runner and controller. */
import { GrblConnection, isWebSerialSupported, probeGrbl, virtualGrblTransport } from '$lib/machine';
import JobControls from '../../machine/JobControls.svelte';
import StateBadge from '../../machine/StateBadge.svelte';
import { machine, type ConnectionKind } from '../../state/machine.svelte';
import type { MachineAdapter, MachineSession } from '../types';
import GrblPanel from './GrblPanel.svelte';
import { exportGcode } from './export';

const session: MachineSession = {
  get connected() {
    return machine.connected;
  },
  get connecting() {
    return machine.connecting;
  },
  get canStop() {
    return machine.canStop;
  },
  get jobActive() {
    return machine.jobActive;
  },
  get safetyRequest() {
    return machine.safetyRequest;
  },
  connect: (kind) => machine.connect(kind as ConnectionKind),
  connectTransport: (kind, transport) => machine.connect(kind as ConnectionKind, transport),
  disconnect: () => machine.disconnect(),
  stop: () => machine.stop(),
  pauseForUnload: () => machine.pauseForUnload(),
};

export const grblAdapter: MachineAdapter = {
  id: 'grbl',
  label: 'GRBL',
  tag: '',
  profileDefaults: {},
  capabilities: { jobOrigin: true, console: true, gcode: true, scanSettings: true },
  exportLabel: 'Export G-code',
  exportJob: exportGcode,
  live: {
    transports: [
      { kind: 'webserial', label: 'Connect laser', medium: 'usb', supported: isWebSerialSupported },
      { kind: 'simulator', label: 'Virtual machine', virtual: true, supported: () => true },
    ],
    session,
    open: (transport, profile, options) => GrblConnection.open(transport, profile, options),
    virtual: (profile, options) => virtualGrblTransport(profile, options),
    // The profile's rate first, then the common one, then 460800 (LaserPecker LP4 and LP5).
    probe: (transport, profile, options) => probeGrbl(transport, [profile.baudRate, 115200, 460800], options),
  },
  badge: StateBadge,
  panel: GrblPanel,
  controls: JobControls,
};
