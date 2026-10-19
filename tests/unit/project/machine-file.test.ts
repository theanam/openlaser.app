import { describe, expect, it } from 'vitest';
import { defaultMachineProfile } from '$lib/project/factory';
import { MachineFileError, parseMachineProfile, serializeMachineProfile } from '$lib/project/machine-file';

describe('machine profile files', () => {
  it('round-trips', () => {
    const profile = defaultMachineProfile({ name: 'Shop laser', bedWidth: 300, bedHeight: 200 });
    expect(parseMachineProfile(serializeMachineProfile(profile))).toEqual(profile);
  });

  it('accepts a bare profile object and fills defaults', () => {
    const profile = parseMachineProfile(JSON.stringify({ name: 'Bare', bedWidth: 100, bedHeight: 100 }));
    expect(profile.baudRate).toBe(115200);
    expect(profile.name).toBe('Bare');
  });

  it('clamps frame power to the safety maximum', () => {
    const profile = parseMachineProfile(JSON.stringify({ name: 'Hot', framePowerPercent: 40 }));
    expect(profile.framePowerPercent).toBe(5);
  });

  it('rejects invalid files', () => {
    expect(() => parseMachineProfile('nope')).toThrow(MachineFileError);
    expect(() => parseMachineProfile('{"bedWidth":10}')).toThrow(MachineFileError);
    expect(() => parseMachineProfile(JSON.stringify({ name: 'x', bedWidth: -1 }))).toThrow(/positive/);
  });
});
