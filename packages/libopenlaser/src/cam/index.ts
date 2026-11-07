/** Public CAM API for the UI and workers. */
export { compileJob, jobStats } from './compile';
export { jobBounds, objectBounds } from './objects';
export { anchorPoint, originOffset } from './origin';
export { DEFAULT_GCODE_OPTIONS, emitGcode, MAX_LINE_LENGTH } from './gcode/emit';
export { DEFAULT_ESTIMATE_LIMITS, estimateSeconds } from './gcode/estimate';
export { DEFAULT_FILL_SETTINGS } from './vector/fill';
export type * from './types';
export { DEFAULT_IMAGE_SETTINGS, ditherPreview } from './raster';
export {
  encodeJob,
  ENCODERS,
  type EncodedJob,
  type EncoderId,
  type EncoderOptions,
  type EncoderPayload,
  type JobEncoder,
} from './encoders';
export * from './laserpecker';
