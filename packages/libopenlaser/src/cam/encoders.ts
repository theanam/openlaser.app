/**
 * Job encoders: one per controller that needs more than G-code, each turning a project into that
 * controller's payload. Pure, so they run in the CAM worker, which looks them up here by id. G-code
 * machines use the preview compile (`compileJob`) directly.
 */
import type { CamWarning, CompileInput } from './types';
import { laserPeckerEncoder } from './laserpecker/encoder';
import { ruidaEncoder } from './ruida/encoder';

export interface EncodedJob<Payload> {
  /** Null when nothing burns. */
  payload: Payload | null;
  warnings: CamWarning[];
}

export interface JobEncoder<Options, Payload> {
  encode(input: CompileInput, options: Options): EncodedJob<Payload>;
}

export const ENCODERS = {
  ruida: ruidaEncoder,
  laserpecker: laserPeckerEncoder,
} as const;

export type EncoderId = keyof typeof ENCODERS;
export type EncoderOptions<Id extends EncoderId> = Parameters<(typeof ENCODERS)[Id]['encode']>[1];
export type EncoderPayload<Id extends EncoderId> = NonNullable<
  ReturnType<(typeof ENCODERS)[Id]['encode']>['payload']
>;

export function encodeJob<Id extends EncoderId>(
  id: Id,
  input: CompileInput,
  options: EncoderOptions<Id>,
): EncodedJob<EncoderPayload<Id>> {
  const encoder = ENCODERS[id] as JobEncoder<EncoderOptions<Id>, EncoderPayload<Id>>;
  return encoder.encode(input, options);
}
