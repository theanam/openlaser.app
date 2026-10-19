/** Public surface of the machine layer (SPEC §7, §8). */
export type * from './types';
export { writable, type Writable } from './store';
export { realScheduler, type Scheduler, type TimerHandle } from './scheduler';
export { VirtualScheduler, DeadlockError } from './virtual-scheduler';
export {
  CommandError,
  DisconnectedError,
  HandshakeError,
  JobStartError,
  MachineBusyError,
  ResetError,
} from './errors';
export {
  CONSOLE_CAPACITY,
  ConsoleLog,
  formatConsoleEntry,
  formatConsoleReport,
  formatConsoleText,
  type ConsoleReportContext,
} from './console-log';

export { GrblDriver, type GrblDriverOptions } from './grbl/driver';
export type { StreamChannel, ResetCause } from './grbl/stream-channel';
export type { LineResponse } from './grbl/line-accounting';
export type { JogDirection } from './grbl/continuous-jog';
export {
  CRITICAL_ALARMS,
  GRBL_ALARMS,
  GRBL_ERRORS,
  alarmMessage,
  describeAlarm,
  describeError,
  errorMessage,
  type GrblCodeInfo,
} from './grbl/error-codes';
export { GRBL_SETTINGS, numericSetting, type GrblSettingInfo } from './grbl/settings-info';
export { classifyLine, type GrblLine } from './grbl/line-classifier';
export { parseStatusReport, type StatusReport } from './grbl/status-report';
export { buildJogCommand, formatNumber } from './grbl/gcode-format';
export { isManualLaserOnCommand } from './grbl/laser-safety';
export { REALTIME_BYTES } from './grbl/realtime';
export { BED_SIZE_TOLERANCE_MM, DEFAULT_RX_SIZE } from './grbl/handshake';

export { JobRunner, type JobRunnerOptions } from './job/runner';
export { buildFrameGcode, MAX_FRAME_POWER_PERCENT } from './job/frame';
export { prepareGcodeLines } from './job/gcode-lines';

export { GrblSimulator, type GrblSimulatorOptions } from './simulator/simulator';
export type { SimulatorFaults } from './simulator/faults';
export type { BurnSegment } from './simulator/motion';
export { createSeededRandom } from './simulator/random';
export { DEFAULT_SIMULATOR_SETTINGS } from './simulator/default-settings';

export { SimulatorTransport } from './transport/simulator-transport';
export { WebSerialTransport, isWebSerialSupported } from './transport/web-serial';
export { COMMON_USB_SERIAL_CHIPS, COMMON_USB_SERIAL_FILTERS, describePort } from './transport/usb-filters';
