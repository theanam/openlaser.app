import type { MachineProfile } from '../../project/types';
import type { Scheduler } from '../scheduler';
import { SimulatorTransport } from '../transport/simulator-transport';
import { GrblSimulator } from './simulator';

/** The "Virtual machine": a simulated GRBL laser sized like the profile. */
export function virtualGrblTransport(
  profile: Pick<MachineProfile, 'bedWidth' | 'bedHeight' | 'maxS'>,
  options: { scheduler?: Scheduler } = {},
): SimulatorTransport {
  return new SimulatorTransport(
    new GrblSimulator({
      scheduler: options.scheduler,
      settings: { 130: profile.bedWidth, 131: profile.bedHeight, 30: profile.maxS },
    }),
  );
}
