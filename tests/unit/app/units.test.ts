import { describe, expect, it } from 'vitest';
import { speedFromUnit, speedLabel, speedToUnit } from '$app/lib/units';
import { layerSummary } from '$app/lib/layers';
import { defaultLayer } from 'libopenlaser/project';

describe('speed units', () => {
  it('converts between stored mm/min and mm/s', () => {
    expect(speedToUnit(3000, 'mm/s')).toBe(50);
    expect(speedFromUnit(50, 'mm/s')).toBe(3000);
    expect(speedToUnit(3000, 'mm/min')).toBe(3000);
    expect(speedFromUnit(3000, 'mm/min')).toBe(3000);
  });

  it('labels speeds compactly', () => {
    expect(speedLabel(3000, 'mm/s')).toBe('50');
    expect(speedLabel(150, 'mm/s')).toBe('2.5');
    expect(speedLabel(1234.4, 'mm/min')).toBe('1234');
  });

  it('shows LaserPecker speeds as depth', () => {
    expect(speedToUnit(2400, 'depth')).toBe(10);
    expect(speedFromUnit(10, 'depth')).toBe(2400);
    expect(speedLabel(2400, 'depth')).toBe('depth 10');
  });

  it('shows layer summaries in the machine’s unit', () => {
    const layer = defaultLayer({ id: 'a', mode: 'line', speed: 1200, power: 60 });
    expect(layerSummary(layer, 'mm/s')).toBe('Line · 20 · 60% · ×1');
    expect(layerSummary(layer)).toBe('Line · 1200 · 60% · ×1');
  });
});
