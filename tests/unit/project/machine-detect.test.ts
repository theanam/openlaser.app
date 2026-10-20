import { describe, expect, it } from 'vitest';
import { bestGuess, detectPresets, isGenericProfileName, modelTokens } from '$lib/project/machine-detect';
import { presetName } from '$lib/project/machine-presets';

const fp = (text: string, travelX: number | null = null, travelY: number | null = null) => ({
  text,
  travelX,
  travelY,
});

describe('machine detection', () => {
  it('extracts distinctive model tokens', () => {
    expect(modelTokens('TS2 10W / 20W')).toEqual(['ts2']);
    expect(modelTokens('Laser Master 3 (10W)')).toEqual([]);
    expect(modelTokens('S30 Pro Max (20W)')).toEqual(['s30']);
  });

  it('picks the Two Trees TS3 from its travel alone', () => {
    const guess = bestGuess(
      detectPresets(fp("Grbl 1.1h ['$' for help]\n[VER:1.1h.20190825:]\n[OPT:VZ,15,128]", 300, 200)),
    );
    expect(guess && presetName(guess.preset)).toBe('Two Trees TS3');
    expect(guess?.reasons).toContain('travel 300 × 200 mm');
  });

  it('picks the TS3 from build info even when travel is generic', () => {
    const guess = bestGuess(detectPresets(fp('[VER:1.1h.20200921:TwoTrees TS3]', 400, 400)));
    expect(guess && presetName(guess.preset)).toBe('Two Trees TS3');
  });

  it('uses brand plus travel to break ties', () => {
    const results = detectPresets(fp('[VER:1.1f.20170801:SCULPFUN]', 380, 385));
    expect(results[0].preset.brand).toBe('Sculpfun');
    expect(bestGuess(results)).toBeNull(); // S30 5W and S30 Pro share a frame
  });

  it('returns nothing useful for an unknown machine', () => {
    expect(bestGuess(detectPresets(fp('Grbl 1.1h', 123, 456)))).toBeNull();
    expect(detectPresets(fp('Grbl 1.1h', null, null))).toEqual([]);
  });

  it('recognises generic profile names', () => {
    expect(isGenericProfileName('Generic GRBL laser')).toBe(true);
    expect(isGenericProfileName('Two Trees TS3')).toBe(false);
  });
});

describe('CO₂ presets in detection', () => {
  it('never guesses a CO₂ machine from bed size alone', async () => {
    const { detectPresets } = await import('$lib/project/machine-detect');
    const hits = detectPresets({ text: 'Grbl 1.1h', travelX: 300, travelY: 200 });
    expect(hits.map((h) => h.preset.laserType ?? 'diode')).not.toContain('co2');
    expect(hits.some((h) => h.preset.controller === 'ruida')).toBe(false);
  });
});
