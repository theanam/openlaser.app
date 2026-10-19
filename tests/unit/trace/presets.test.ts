import { describe, expect, it } from 'vitest';
import { TRACE_PRESETS, tracePreset } from '$lib/trace/presets';

describe('trace presets', () => {
  it('never stack layers, so overlaps are not burned twice', () => {
    expect(TRACE_PRESETS.length).toBeGreaterThan(0);
    for (const p of TRACE_PRESETS) expect(p.options.stacked, p.id).toBe(false);
  });

  it('looks presets up by id', () => {
    for (const p of TRACE_PRESETS) expect(tracePreset(p.id)).toBe(p);
  });
});
