import { describe, expect, it } from 'vitest';
import {
  GENERIC_BRAND,
  groupByBrand,
  MACHINE_PRESETS,
  presetName,
  presetProfileFields,
  searchPresets,
} from '$lib/project/machine-presets';

describe('machine presets', () => {
  it('includes the Two Trees TS3', () => {
    const ts3 = MACHINE_PRESETS.find((p) => p.brand === 'Two Trees' && p.model === 'TS3');
    expect(ts3).toMatchObject({ bedWidth: 300, bedHeight: 200 });
    expect(presetName(ts3!)).toBe('Two Trees TS3');
  });

  it('has unique names and sane sizes', () => {
    const names = MACHINE_PRESETS.map(presetName);
    expect(new Set(names).size).toBe(names.length);
    expect(MACHINE_PRESETS.length).toBeGreaterThan(40);
    for (const p of MACHINE_PRESETS) {
      expect(p.bedWidth).toBeGreaterThanOrEqual(100);
      expect(p.bedHeight).toBeGreaterThanOrEqual(100);
      expect(p.bedWidth).toBeLessThanOrEqual(1000);
      expect(p.bedHeight).toBeLessThanOrEqual(1000);
    }
  });

  it('searches brand and model with every word', () => {
    expect(searchPresets('ts3').map(presetName)).toEqual(['Two Trees TS3']);
    expect(searchPresets('two trees ts2').length).toBe(2);
    expect(searchPresets('sculpfun s30').every((p) => p.brand === 'Sculpfun')).toBe(true);
    expect(searchPresets('nothing like this')).toEqual([]);
    expect(searchPresets('  ').length).toBe(MACHINE_PRESETS.length);
  });

  it('groups by brand with Generic first', () => {
    const groups = groupByBrand(MACHINE_PRESETS);
    expect(groups[0].brand).toBe(GENERIC_BRAND);
    const rest = groups.slice(1).map((g) => g.brand);
    expect(rest).toEqual([...rest].sort((a, b) => a.localeCompare(b)));
  });

  it('turns a preset into profile fields', () => {
    const s30 = MACHINE_PRESETS.find((p) => p.model === 'S30 Pro (10W)')!;
    expect(presetProfileFields(s30)).toEqual({
      name: 'Sculpfun S30 Pro (10W)',
      bedWidth: 380,
      bedHeight: 385,
      originCorner: 'bl',
      supportsAirAssist: true,
    });
  });
});
