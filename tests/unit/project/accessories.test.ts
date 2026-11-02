import { describe, expect, it } from 'vitest';
import {
  activeAccessory,
  DEFAULT_OBJECT_DIAMETER,
  layerSource,
  modeGcode,
  rotaryScale,
  workArea,
  workProfile,
  yAxisMapping,
} from '$lib/project/accessories';
import { defaultMachineProfile } from '$lib/project/factory';
import { parseMachineProfile, serializeMachineProfile } from '$lib/project/machine-file';
import { MACHINE_PRESETS, presetProfileFields } from '$lib/project/machine-presets';
import type { MachineAccessory, RotarySetup } from '$lib/project/types';

const roller: RotarySetup = {
  type: 'roller',
  axis: 'y',
  unitsPerRotation: 80,
  rollerDiameter: 20,
  deviceScales: false,
};
const rotary: MachineAccessory = {
  id: 'rot',
  kind: 'rotary',
  label: 'Rotary',
  bedWidth: 200,
  bedHeight: 400,
  startGcode: 'M3032',
  rotary: roller,
};
const slide: MachineAccessory = {
  id: 'sl',
  kind: 'slide',
  label: 'Slide',
  bedWidth: 160,
  bedHeight: 300,
  startGcode: 'M3031',
};
const profile = defaultMachineProfile({
  bedWidth: 300,
  bedHeight: 200,
  accessories: [rotary, slide],
  flatModeGcode: 'M3030',
  laserSources: [
    { id: 'blue', label: 'Blue', wavelength: 450, selectGcode: 'M3010', deviceCode: 0 },
    { id: 'ir', label: 'IR', wavelength: 1064, selectGcode: 'M3011', deviceCode: 1 },
  ],
});

describe('accessories', () => {
  it('uses the flat bed until an accessory is picked, and forgets accessories the profile lost', () => {
    expect(workArea(profile, {})).toEqual({ width: 300, height: 200 });
    expect(activeAccessory(profile, { accessoryId: 'gone' })).toBeNull();
    expect(workProfile(profile, {})).toBe(profile);
  });

  it('takes the slide’s work area', () => {
    expect(workArea(profile, { accessoryId: 'sl' })).toEqual({ width: 160, height: 300 });
    expect(workProfile(profile, { accessoryId: 'sl' })).toMatchObject({ bedWidth: 160, bedHeight: 300 });
  });

  it('unrolls a rotary object: one circumference tall, capped by the rotary', () => {
    expect(workArea(profile, { accessoryId: 'rot', objectDiameter: 50 }).height).toBeCloseTo(Math.PI * 50);
    expect(workArea(profile, { accessoryId: 'rot', objectDiameter: 500 }).height).toBe(400);
    expect(workArea(profile, { accessoryId: 'rot' }).height).toBeCloseTo(Math.PI * DEFAULT_OBJECT_DIAMETER);
  });

  it('sends the mode G-code for what is fitted', () => {
    expect(modeGcode(profile, {})).toBe('M3030');
    expect(modeGcode(profile, { accessoryId: 'rot' })).toBe('M3032');
    expect(modeGcode(defaultMachineProfile(), {})).toBe('');
  });

  it('scales rollers by the roller and chucks by the object', () => {
    // A roller turns the object by its own circumference, whatever the object's size.
    expect(rotaryScale(roller, 50)).toBeCloseTo(80 / (Math.PI * 20));
    expect(rotaryScale(roller, 100)).toBeCloseTo(80 / (Math.PI * 20));
    const chuck: RotarySetup = { ...roller, type: 'chuck', axis: 'a', unitsPerRotation: 360 };
    expect(rotaryScale(chuck, 50)).toBeCloseTo(360 / (Math.PI * 50));
    expect(rotaryScale({ ...roller, deviceScales: true }, 50)).toBe(1);
  });

  it('maps Y to the rotary axis only when it changes anything', () => {
    expect(yAxisMapping(profile, {})).toBeNull();
    expect(yAxisMapping(profile, { accessoryId: 'rot', objectDiameter: 50 })).toEqual({
      letter: 'Y',
      scale: 80 / (Math.PI * 20),
    });
    const onA = defaultMachineProfile({
      accessories: [{ ...rotary, rotary: { ...roller, type: 'chuck', axis: 'a', unitsPerRotation: 360 } }],
    });
    expect(yAxisMapping(onA, { accessoryId: 'rot', objectDiameter: 40 })?.letter).toBe('A');
    const scaling = defaultMachineProfile({
      accessories: [{ ...rotary, rotary: { ...roller, deviceScales: true } }],
    });
    expect(yAxisMapping(scaling, { accessoryId: 'rot' })).toBeNull();
  });

  it('gives each layer its laser, the first by default', () => {
    expect(layerSource(profile, {})?.id).toBe('blue');
    expect(layerSource(profile, { laserSourceId: 'ir' })?.id).toBe('ir');
    expect(layerSource(profile, { laserSourceId: 'gone' })?.id).toBe('blue');
    expect(layerSource(defaultMachineProfile(), {})).toBeNull();
  });

  it('keeps lasers and accessories through a machine file and drops broken entries', () => {
    expect(parseMachineProfile(serializeMachineProfile(profile))).toEqual(profile);
    const broken = JSON.stringify({
      name: 'X',
      laserSources: [{ id: 'a' }, { label: 'no id' }, 7],
      accessories: [
        { id: 'r', kind: 'rotary', bedWidth: 10, bedHeight: 10 },
        { id: 's', kind: 'slide', bedWidth: 10, bedHeight: 20 },
        { id: 'z', kind: 'warp', bedWidth: 10, bedHeight: 10 },
        { id: 'w', kind: 'slide', bedWidth: -1, bedHeight: 10 },
      ],
    });
    const parsed = parseMachineProfile(broken);
    expect(parsed.laserSources).toEqual([
      { id: 'a', label: 'a', wavelength: 450, selectGcode: '', deviceCode: 0 },
    ]);
    expect(parsed.accessories?.map((a) => a.id)).toEqual(['s']);
    expect(parsed.flatModeGcode).toBe('');
  });

  it('ships LaserPecker presets with their lasers, modes and accessories', () => {
    const lp4 = MACHINE_PRESETS.find((p) => p.brand === 'LaserPecker' && p.model === 'LP4')!;
    const fields = presetProfileFields(lp4);
    expect(fields).toMatchObject({
      controller: 'grbl',
      baudRate: 460800,
      bedWidth: 160,
      bedHeight: 120,
      maxS: 255,
      flatModeGcode: 'M3030',
    });
    expect(fields.laserSources?.map((s) => s.selectGcode)).toEqual(['M3010', 'M3011']);
    expect(fields.accessories?.map((a) => [a.kind, a.startGcode, a.bedWidth, a.bedHeight])).toEqual([
      ['slide', 'M3031', 160, 300],
      ['rotary', 'M3032', 160, 628],
    ]);
    const lp5 = presetProfileFields(MACHINE_PRESETS.find((p) => p.model === 'LP5')!);
    expect(lp5.accessories?.map((a) => [a.bedWidth, a.bedHeight])).toEqual([[300, 160]]);
    expect(fields.accessories?.[1].rotary).toMatchObject({ type: 'chuck', axis: 'y', unitsPerRotation: 256 });
    const lp3 = presetProfileFields(MACHINE_PRESETS.find((p) => p.model === 'LP3')!);
    expect(lp3.laserSources).toEqual([
      { id: 'ir', label: '1064 nm infrared', wavelength: 1064, selectGcode: '', deviceCode: 1 },
    ]);
    const lp2 = presetProfileFields(MACHINE_PRESETS.find((p) => p.model === 'LP2')!);
    expect(lp2.accessories?.find((a) => a.kind === 'rotary')?.rotary?.deviceScales).toBe(true);
  });
});
