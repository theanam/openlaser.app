import { describe, expect, it } from 'vitest';
import { chooseProfile } from '$app/machines/connect.svelte';
import { adapterFor } from '$app/machines/registry';
import { defaultMachineProfile } from 'libopenlaser/project';

const grbl = adapterFor('grbl');
const lp = adapterFor('laserpecker');
const gen = defaultMachineProfile({ id: 'g', name: 'Generic GRBL laser' });
const lp3 = defaultMachineProfile({
  id: 'l3',
  name: 'LaserPecker LP3',
  controller: 'laserpecker',
  baudRate: 460800,
});
const lp2 = defaultMachineProfile({
  id: 'l2',
  name: 'LaserPecker LP2',
  controller: 'laserpecker',
  baudRate: 460800,
});

describe('choosing a profile for a detected machine', () => {
  it('keeps the selected profile when it fits', () => {
    expect(chooseProfile(grbl, { baudRate: 115200 }, [gen, lp3], gen)).toEqual({
      profile: gen,
      created: false,
    });
  });

  it('switches to an existing profile of that kind and model', () => {
    expect(chooseProfile(lp, { baudRate: 0, model: 'LP3' }, [gen, lp2, lp3], gen).profile).toBe(lp3);
    expect(chooseProfile(lp, { baudRate: 0, model: 'LP2' }, [gen, lp2, lp3], lp3).profile).toBe(lp2);
  });

  it('creates a profile from the model’s preset when there is none', () => {
    const { profile, created } = chooseProfile(lp, { baudRate: 0, model: 'LP3' }, [gen], gen);
    expect(created).toBe(true);
    expect(profile).toMatchObject({ name: 'LaserPecker LP3', controller: 'laserpecker', bedWidth: 115 });
    expect(profile.laserSources?.[0]?.deviceCode).toBe(1);
  });

  it('gives an LP4 over Bluetooth its own LaserPecker-protocol profile, both lasers', () => {
    const usb = defaultMachineProfile({ id: 'l4', name: 'LaserPecker LP4', baudRate: 460800 });
    const { profile, created } = chooseProfile(lp, { baudRate: 0, model: 'LP4' }, [gen, usb], usb);
    expect(created).toBe(true);
    expect(profile).toMatchObject({
      name: 'LaserPecker LP4 Bluetooth',
      controller: 'laserpecker',
      bedWidth: 160,
    });
    expect(profile.laserSources?.map((s) => s.deviceCode)).toEqual([0, 1]);
  });

  it('falls back to the adapter’s defaults for an unknown model', () => {
    const { profile } = chooseProfile(lp, { baudRate: 460800, model: 'LaserPecker' }, [gen], gen);
    expect(profile).toMatchObject({ controller: 'laserpecker', speedUnit: 'depth', originCorner: 'tl' });
  });

  it('keeps the baud rate that answered', () => {
    const { profile, created } = chooseProfile(grbl, { baudRate: 460800 }, [gen], gen);
    expect(profile).toMatchObject({ id: 'g', baudRate: 460800 });
    expect(created).toBe(false);
  });
});
