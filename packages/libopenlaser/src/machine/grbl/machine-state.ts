import type { MachineState } from '../types';
import { resolvePositions, type StatusReport } from './status-report';

export function initialMachineState(): MachineState {
  return {
    connection: 'disconnected',
    firmware: null,
    status: 'Unknown',
    subState: null,
    mpos: null,
    wpos: null,
    wco: null,
    feed: 0,
    spindle: 0,
    overrides: { feed: 100, rapid: 100, spindle: 100 },
    buffer: null,
    alarm: null,
    lastError: null,
    settings: {},
    homed: false,
  };
}

/** Merges a status report into the machine state; fields the report omits keep their value. */
export function applyStatusReport(state: MachineState, report: StatusReport): MachineState {
  const positions = resolvePositions(report, state.wco);
  return {
    ...state,
    status: report.status,
    subState: report.subState,
    mpos: positions.mpos ?? state.mpos,
    wpos: positions.wpos ?? state.wpos,
    wco: positions.wco,
    feed: report.feed ?? state.feed,
    spindle: report.spindle ?? state.spindle,
    overrides: report.overrides ?? state.overrides,
    buffer: report.buffer ?? state.buffer,
    // An alarm is over once the controller reports any other state.
    alarm: report.status === 'Alarm' ? state.alarm : null,
  };
}
