import { describe, expect, it } from 'vitest';
import { applyStatusReport, initialMachineState } from '$lib/machine/grbl/machine-state';
import { parseStatusReport, resolvePositions } from '$lib/machine/grbl/status-report';

describe('parseStatusReport', () => {
  it('parses a full GRBL 1.1 report', () => {
    const report = parseStatusReport(
      'Run|MPos:10.000,20.500,0.000|Bf:12,100|Ln:7|FS:3000,750|Pn:XP|WCO:1.000,2.000,0.000',
    );
    expect(report).toEqual({
      status: 'Run',
      subState: null,
      mpos: { x: 10, y: 20.5, z: 0 },
      buffer: { plannerFree: 12, rxFree: 100 },
      lineNumber: 7,
      feed: 3000,
      spindle: 750,
      pins: 'XP',
      wco: { x: 1, y: 2, z: 0 },
    });
  });

  it('parses sub-states, F-only feed and overrides', () => {
    expect(parseStatusReport('Hold:1|WPos:1,2,3|F:500|Ov:120,50,80')).toEqual({
      status: 'Hold',
      subState: 1,
      wpos: { x: 1, y: 2, z: 3 },
      feed: 500,
      overrides: { feed: 120, rapid: 50, spindle: 80 },
    });
    expect(parseStatusReport('Door:2|MPos:0,0,0').subState).toBe(2);
  });

  it('takes the first three axes of 4–6 axis machines and defaults missing Z', () => {
    expect(parseStatusReport('Idle|MPos:1,2,3,4,5,6').mpos).toEqual({ x: 1, y: 2, z: 3 });
    expect(parseStatusReport('Idle|MPos:1,2').mpos).toEqual({ x: 1, y: 2, z: 0 });
  });

  it('ignores unknown fields and unknown states', () => {
    expect(parseStatusReport('Idle|MPos:0,0,0|A:SFM|Foo:bar|junk').mpos).toEqual({ x: 0, y: 0, z: 0 });
    expect(parseStatusReport('Tool|MPos:0,0,0').status).toBe('Unknown');
  });
});

describe('position resolution', () => {
  it('computes WPos from MPos and a cached WCO', () => {
    const first = applyStatusReport(
      initialMachineState(),
      parseStatusReport('Idle|MPos:10,10,0|FS:0,0|WCO:2,3,0'),
    );
    expect(first.wpos).toEqual({ x: 8, y: 7, z: 0 });
    // Later reports omit WCO; the cached offset still applies.
    const second = applyStatusReport(first, parseStatusReport('Run|MPos:12,10,0|FS:100,0'));
    expect(second.wco).toEqual({ x: 2, y: 3, z: 0 });
    expect(second.wpos).toEqual({ x: 10, y: 7, z: 0 });
  });

  it('computes MPos from WPos', () => {
    expect(resolvePositions(parseStatusReport('Idle|WPos:1,1,0|WCO:5,5,0'), null).mpos).toEqual({
      x: 6,
      y: 6,
      z: 0,
    });
  });

  it('assumes a zero offset until a WCO arrives', () => {
    const resolved = resolvePositions(parseStatusReport('Idle|MPos:4,5,0'), null);
    expect(resolved).toEqual({ mpos: { x: 4, y: 5, z: 0 }, wpos: { x: 4, y: 5, z: 0 }, wco: null });
  });

  it('clears the alarm once the machine reports another state', () => {
    const alarmed = { ...initialMachineState(), status: 'Alarm' as const, alarm: { code: 1, message: 'x' } };
    expect(applyStatusReport(alarmed, parseStatusReport('Alarm|MPos:0,0,0')).alarm).not.toBeNull();
    expect(applyStatusReport(alarmed, parseStatusReport('Idle|MPos:0,0,0')).alarm).toBeNull();
  });
});
