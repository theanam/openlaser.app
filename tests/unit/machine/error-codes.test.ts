import { describe, expect, it } from 'vitest';
import {
  GRBL_ALARMS,
  GRBL_ERRORS,
  alarmMessage,
  describeAlarm,
  describeError,
  errorMessage,
} from '$lib/machine/grbl/error-codes';

describe('GRBL code tables', () => {
  it('has every GRBL 1.1 error code (1–17, 20–38)', () => {
    const expected = [
      ...Array.from({ length: 17 }, (_, i) => i + 1),
      ...Array.from({ length: 19 }, (_, i) => i + 20),
    ];
    expect([...GRBL_ERRORS.keys()].sort((a, b) => a - b)).toEqual(expected);
  });

  it('has every GRBL 1.1 alarm code (1–9)', () => {
    expect([...GRBL_ALARMS.keys()].sort((a, b) => a - b)).toEqual([1, 2, 3, 4, 5, 6, 7, 8, 9]);
  });

  it('uses the official descriptions', () => {
    expect(describeError(22).description).toBe('Feed rate has not yet been set or is undefined.');
    expect(describeAlarm(1).description).toMatch(/^Hard limit has been triggered/);
    expect(errorMessage(20)).toBe(
      'Unsupported command: Unsupported or invalid g-code command found in block.',
    );
    expect(alarmMessage(9)).toMatch(/^Homing fail: /);
  });

  it('has "what to do" hints for the common cases', () => {
    for (const code of [1, 2, 9]) expect(describeAlarm(code).hint).toBeTruthy();
    for (const code of [9, 20, 22]) expect(describeError(code).hint).toBeTruthy();
  });

  it('describes unknown codes without throwing', () => {
    expect(describeError(99)).toEqual({ code: 99, name: 'Error 99', description: 'Unknown error code 99.' });
    expect(describeAlarm(42).name).toBe('Alarm 42');
  });
});
