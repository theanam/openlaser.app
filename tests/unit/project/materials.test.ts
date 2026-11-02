import { describe, expect, it } from 'vitest';
import {
  MATERIAL_PRESETS,
  presetBasis,
  presetLayerPatch,
  presetName,
  presetsFor,
} from '$lib/project/materials';
import { speedFromDepth } from '$lib/project/depth';
import { defaultMachineProfile } from '$lib/project/factory';
import { wattsFromModel } from '$lib/project/machine-presets';
import { layer } from '../cam/fixtures';

const lp = (model: string) =>
  defaultMachineProfile({ name: `LaserPecker ${model}`, controller: 'laserpecker' });

describe('material presets', () => {
  it('are complete and sourced', () => {
    const ids = MATERIAL_PRESETS.map((p) => p.id);
    expect(new Set(ids).size).toBe(ids.length);
    for (const p of MATERIAL_PRESETS) {
      expect(p.source).toMatch(/^https:\/\//);
      expect(p.power).toBeGreaterThan(0);
      expect(p.power).toBeLessThanOrEqual(100);
      expect(p.speed).toBeGreaterThan(0);
      expect(p.passes).toBeGreaterThanOrEqual(1);
      // Cutting is always a line job; engraving never a cut.
      if (p.operation === 'cut') expect(p.mode).toBe('line');
    }
  });

  it('matches LaserPeckers by model, with their own tables', () => {
    expect(presetBasis(lp('LP3'))).toEqual({ kind: 'model', model: 'LaserPecker LP3' });
    const steel = presetsFor(presetBasis(lp('LP3')), 'engrave').filter(
      (p) => p.material === 'Stainless Steel',
    );
    expect(steel.length).toBeGreaterThan(0);
    expect(steel.every((p) => p.wavelength === 1064)).toBe(true);
  });

  it('keeps engraving and cutting apart, and dual lasers apart', () => {
    const basis = presetBasis(lp('LP4'));
    const engrave = presetsFor(basis, 'engrave');
    const cut = presetsFor(basis, 'cut');
    expect(cut.length).toBeGreaterThan(0);
    expect(cut.every((p) => p.operation === 'cut' && p.wavelength === 450)).toBe(true);
    expect(new Set(engrave.map((p) => p.wavelength))).toEqual(new Set([450, 1064]));
  });

  it('stores LaserPecker depth as speed', () => {
    const [p] = presetsFor(presetBasis(lp('LP2')), 'engrave').filter(
      (x) => x.material === 'Oxidized Metal' && x.resolution === '1K' && x.mode === 'fill',
    );
    expect(p).toMatchObject({ power: 100, speed: speedFromDepth(10) });
    expect(presetName({ material: 'Basswood plank', thicknessMm: 3 })).toBe('Basswood plank · 3 mm');
  });

  it('needs the laser power for other machines', () => {
    expect(presetBasis(defaultMachineProfile())).toEqual({ kind: 'none', laser: 'diode' });
  });

  it('turns a fill layer into a line layer for a cut, and leaves images their mode', () => {
    const cut = presetsFor(presetBasis(lp('LP4')), 'cut')[0]!;
    expect(presetLayerPatch(layer({ id: 'f', mode: 'fill' }), cut)).toMatchObject({
      mode: 'line',
      materialId: cut.id,
    });
    const picture = presetsFor(presetBasis(lp('LP4')), 'engrave').find((p) => p.mode === 'image')!;
    expect(presetLayerPatch(layer({ id: 'i', mode: 'image' }), picture).mode).toBeUndefined();
  });

  it('reads the optical power from a model name with one rating', () => {
    expect(wattsFromModel('S30 Pro (10W)')).toBe(10);
    expect(wattsFromModel('SF-A9 40W')).toBe(40);
    expect(wattsFromModel('Falcon 5W / 10W')).toBeUndefined();
    expect(wattsFromModel('Laser Master 3')).toBeUndefined();
  });
});

describe('presets by laser power', () => {
  const diode = (laserWatts: number) => defaultMachineProfile({ laserWatts });
  const co2 = (laserWatts: number) => defaultMachineProfile({ laserWatts, laserType: 'co2' });

  it('picks the nearest class at or below the laser power', () => {
    expect(presetBasis(diode(12))).toEqual({ kind: 'class', laser: 'diode', watts: 10 });
    expect(presetBasis(diode(40))).toEqual({ kind: 'class', laser: 'diode', watts: 40 });
    expect(presetBasis(diode(2))).toEqual({ kind: 'class', laser: 'diode', watts: 5 });
  });

  it('has diode and CO₂ tables for engraving and cutting in every class', () => {
    for (const w of [5, 10, 20, 40]) {
      expect(presetsFor(presetBasis(diode(w)), 'engrave').length).toBeGreaterThan(10);
      expect(presetsFor(presetBasis(diode(w)), 'cut').length).toBeGreaterThan(10);
    }
    for (const w of [40, 60, 80, 100]) {
      const basis = presetBasis(co2(w));
      expect(basis).toMatchObject({ laser: 'co2', watts: w });
      expect(presetsFor(basis, 'cut').length).toBeGreaterThan(10);
      expect(presetsFor(basis, 'engrave').length).toBeGreaterThan(5);
    }
  });

  it('names the maker of every class preset', () => {
    for (const p of MATERIAL_PRESETS.filter((x) => x.machine.kind === 'class')) expect(p.brand).toBeTruthy();
  });

  it('never offers PVC or vinyl', () => {
    expect(MATERIAL_PRESETS.filter((p) => /\b(pvc|vinyl)\b/i.test(p.material))).toEqual([]);
  });
});
