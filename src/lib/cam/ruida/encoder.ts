/** Project → Ruida .rd job bytes, for machines that run jobs from a USB stick. */
import { compileJob } from '../compile';
import type { JobEncoder } from '../encoders';
import { emitRuida } from './emit';

export const ruidaEncoder: JobEncoder<void, Uint8Array> = {
  encode(input) {
    // Ruida jobs run from the controller's panel at bed positions.
    const plan = compileJob({ ...input, absoluteOrigin: true });
    const layers = new Map(input.project.layers.map((l) => [l.id, { color: l.color }]));
    const payload =
      plan.toolpaths.length > 0
        ? emitRuida(plan.toolpaths, { layers, airAssist: input.profile.supportsAirAssist })
        : null;
    return { payload, warnings: plan.warnings };
  },
};
