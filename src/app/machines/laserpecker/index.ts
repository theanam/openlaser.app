/**
 * LaserPecker engravers over Bluetooth or USB, with their own protocol. Protocol details from the
 * LaserPecker protocol notes by nerdocs (https://github.com/nerdocs/pyrograph/blob/main/docs/protocol.md);
 * implemented independently, no code from pyrograph is included.
 */
import { isWebBluetoothSupported, isWebSerialSupported } from 'libopenlaser/machine';
import {
  LASERPECKER_BAUD,
  LaserPeckerConnection,
  VirtualLaserPecker,
  probeLaserPecker,
} from 'libopenlaser/machine';
import type { MachineAdapter } from '../types';
import { exportGcode } from '../grbl/export';
import LaserPeckerBadge from './LaserPeckerBadge.svelte';
import LaserPeckerControls from './LaserPeckerControls.svelte';
import LaserPeckerPanel from './LaserPeckerPanel.svelte';
import { laserpecker } from './session.svelte';

export const laserPeckerAdapter: MachineAdapter = {
  id: 'laserpecker',
  label: 'LaserPecker',
  tag: 'LaserPecker',
  profileDefaults: {
    originCorner: 'tl',
    baudRate: LASERPECKER_BAUD,
    laserType: 'diode',
    constantPower: false,
    speedUnit: 'depth',
    supportsAirAssist: false,
  },
  capabilities: { jobOrigin: false, console: false, gcode: false, scanSettings: false },
  exportLabel: 'Export G-code',
  exportJob: exportGcode,
  live: {
    transports: [
      {
        kind: 'bluetooth',
        label: 'Connect Bluetooth',
        medium: 'bluetooth',
        supported: isWebBluetoothSupported,
      },
      { kind: 'usb', label: 'Connect USB', medium: 'usb', supported: isWebSerialSupported },
      { kind: 'virtual', label: 'Virtual LaserPecker', virtual: true, supported: () => true },
    ],
    session: laserpecker,
    open: (transport, profile, options) =>
      LaserPeckerConnection.open(transport, { scheduler: options?.scheduler, baudRate: profile.baudRate }),
    virtual: (_profile, options) => new VirtualLaserPecker({ scheduler: options?.scheduler }),
    probe: (transport, _profile, options) => probeLaserPecker(transport, LASERPECKER_BAUD, options),
  },
  badge: LaserPeckerBadge,
  panel: LaserPeckerPanel,
  controls: LaserPeckerControls,
};
