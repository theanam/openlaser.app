/**
 * LaserPecker engravers. Protocol details from the LaserPecker protocol notes by nerdocs
 * (https://github.com/nerdocs/pyrograph/blob/main/docs/protocol.md). Implemented independently from
 * that description; no code from pyrograph is included.
 */
export { encodeFrame, FrameReader, sum16, type DeviceFrame, type ShortFrame } from './frame';
export { FRAME_POWER, type PreviewRect, type PrintJob } from './commands';
export { errorText, hex, type DeviceMode, type DeviceStatus, type DeviceVersion } from './replies';
export {
  DEFAULT_RESOLUTION,
  RESOLUTIONS,
  formatFirmware,
  modelFromVersion,
  resolutionByPx,
  type ModelInfo,
  type Resolution,
} from './models';
export {
  LaserPeckerDriver,
  UploadRefusedError,
  type EngraveResult,
  type LaserPeckerActivity,
  type LaserPeckerDriverOptions,
  type LaserPeckerState,
  type UploadFile,
} from './driver';
export type { LinkLog } from './link';
export { VirtualLaserPecker, type VirtualLaserPeckerOptions } from './virtual-device';
export {
  LASERPECKER_BAUD,
  LaserPeckerConnection,
  type LaserPeckerFrame,
  type LaserPeckerJob,
  type LaserPeckerPart,
} from './connection';
export { probeLaserPecker } from './probe';
