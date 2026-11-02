import { describe, expect, it } from 'vitest';
import { compileJob } from '$lib/cam';
import { laserPeckerEncoder } from '$lib/cam/laserpecker';
import { parseGcode } from '$lib/import/gcode';
import { buildFrameGcode } from '$lib/machine/job/frame';
import type { MachineAccessory, MachineProfile } from '$lib/project/types';
import { compileInput, layer, profile, project, rectPath, vectorObject } from './fixtures';

const rotary = (setup: Partial<NonNullable<MachineAccessory['rotary']>> = {}): MachineAccessory => ({
  id: 'rot',
  kind: 'rotary',
  label: 'Rotary',
  bedWidth: 300,
  bedHeight: 500,
  startGcode: 'M3032',
  rotary: {
    type: 'roller',
    axis: 'y',
    unitsPerRotation: 100,
    rollerDiameter: 10,
    deviceScales: false,
    ...setup,
  },
});

const machine = (extra: Partial<MachineProfile> = {}) =>
  profile({
    bedWidth: 300,
    bedHeight: 100,
    flatModeGcode: 'M3030',
    accessories: [rotary()],
    laserSources: [
      { id: 'blue', label: 'Blue', wavelength: 450, selectGcode: 'M3010', deviceCode: 0 },
      { id: 'ir', label: 'IR', wavelength: 1064, selectGcode: 'M3011\nQ40', deviceCode: 1 },
    ],
    ...extra,
  });

const lines = (l: string) => layer({ id: l, mode: 'line' });
const yWords = (gcode: string[]) =>
  gcode.flatMap((line) => [...line.matchAll(/([YA])(-?[\d.]+)/g)].map((m) => `${m[1]}${m[2]}`));

describe('rotary jobs', () => {
  const design = project([lines('a')], [vectorObject('r', 'a', [rectPath(10, 20, 10, 10)])], {
    accessoryId: 'rot',
    objectDiameter: 40,
  });

  it('scales Y by the roller: 100 mm per turn of a 10 mm roller', () => {
    const plan = compileJob(compileInput(design, { profile: machine() }));
    const scale = 100 / (Math.PI * 10);
    expect(plan.yAxis).toEqual({ letter: 'Y', scale });
    expect(yWords(plan.gcode)).toContain(`Y${(20 * scale).toFixed(3).replace(/\.?0+$/, '')}`);
    // Bounds, checks and stats stay in surface mm.
    expect(plan.bounds?.minY).toBeCloseTo(20, 3);
    expect(plan.bounds?.maxY).toBeCloseTo(30, 3);
    expect(plan.warnings.filter((w) => w.code === 'out-of-bounds')).toEqual([]);
  });

  it('turns a chuck on the A axis in degrees per object turn', () => {
    const onA = machine({ accessories: [rotary({ type: 'chuck', axis: 'a', unitsPerRotation: 360 })] });
    const plan = compileJob(compileInput(design, { profile: onA }));
    const words = yWords(plan.gcode);
    expect(words.every((w) => w.startsWith('A'))).toBe(true);
    // 20 mm along a 40 mm object's surface is 20 / (π·40) of a turn.
    expect(Number(words.find((w) => w !== 'A0')!.slice(1))).toBeCloseTo((20 * 360) / (Math.PI * 40), 2);
  });

  it('reads rotary G-code back as surface mm for the preview', () => {
    const onA = machine({ accessories: [rotary({ type: 'chuck', axis: 'a', unitsPerRotation: 360 })] });
    const plan = compileJob(compileInput(design, { profile: onA }));
    const moves = parseGcode(plan.gcode.join('\n'), { yAxis: plan.yAxis });
    expect(moves.burnBounds?.minY).toBeCloseTo(20, 2);
    expect(moves.burnBounds?.maxY).toBeCloseTo(30, 2);
  });

  it('frames on the same axis and scale', () => {
    const frame = buildFrameGcode({ minX: 0, minY: 10, maxX: 5, maxY: 20 }, machine(), {
      letter: 'A',
      scale: 2,
    });
    expect(frame.filter((l) => l.startsWith('G')).slice(2)).toEqual([
      'G0 X0 A20',
      'G1 X5 A20 F3000 S0',
      'G1 X5 A40',
      'G1 X0 A40',
      'G1 X0 A20',
    ]);
  });

  it('uses the unrolled surface as the work area', () => {
    const tall = project([lines('a')], [vectorObject('r', 'a', [rectPath(10, 20, 10, 150)])], {
      accessoryId: 'rot',
      objectDiameter: 40,
    });
    const warnings = compileJob(compileInput(tall, { profile: machine() })).warnings.map((w) => w.code);
    // 170 mm tall on a 40 mm object (125.7 mm around) runs off the surface.
    expect(warnings).toContain('out-of-bounds');
  });

  it('switches the machine to the job’s mode first', () => {
    const flat = compileJob(
      compileInput(
        { ...design, jobSettings: { ...design.jobSettings, accessoryId: null } },
        { profile: machine() },
      ),
    );
    expect(flat.gcode.slice(3, 4)).toEqual(['M3030']);
    const round = compileJob(compileInput(design, { profile: machine() }));
    expect(round.gcode.slice(3, 4)).toEqual(['M3032']);
  });
});

describe('laser sources', () => {
  const twoLasers = project(
    [lines('a'), { ...lines('b'), laserSourceId: 'ir' }, { ...lines('c'), laserSourceId: 'ir' }],
    [
      vectorObject('r1', 'a', [rectPath(10, 10, 5, 5)]),
      vectorObject('r2', 'b', [rectPath(30, 10, 5, 5)]),
      vectorObject('r3', 'c', [rectPath(50, 10, 5, 5)]),
    ],
  );

  it('switches lasers with the laser off, only when the laser changes', () => {
    const gcode = compileJob(compileInput(twoLasers, { profile: machine() })).gcode;
    const switches = gcode.flatMap((l, i) => (/^M301[01]$|^Q/.test(l) ? [`${gcode[i - 1]} → ${l}`] : []));
    expect(switches).toEqual(['M5 S0 → M3010', 'M5 S0 → M3011', 'M3011 → Q40']);
    // After each switch the laser mode comes back on before burning.
    const ir = gcode.indexOf('Q40');
    expect(gcode[ir + 1]).toBe('M4 S0');
  });

  it('leaves one-laser machines alone', () => {
    const gcode = compileJob(compileInput(twoLasers, { profile: profile() })).gcode;
    expect(gcode.filter((l) => /^M301|^M5/.test(l))).toEqual(['M5 S0']);
  });

  it('splits a LaserPecker job into one file per laser, in layer order', () => {
    const lp = machine({ controller: 'laserpecker', originCorner: 'tl', accessories: [] });
    const { payload } = laserPeckerEncoder.encode(compileInput(twoLasers, { profile: lp }), {
      dpi: 254,
      px: 4,
      packed: false,
    });
    expect(payload?.parts.map((p) => [p.sourceId, p.laserType])).toEqual([
      ['blue', 0],
      ['ir', 1],
    ]);
    expect(payload?.layers).toBe(3);
    expect(payload?.frame).toMatchObject({ x: 10, width: 45 });
    expect(payload?.accessory).toBeNull();
  });

  it('tells a LaserPecker job its rotary and object diameter', () => {
    const lp = profile({
      controller: 'laserpecker',
      originCorner: 'tl',
      accessories: [{ ...rotary({ deviceScales: true }), startGcode: '' }],
    });
    const round = project([lines('a')], [vectorObject('r', 'a', [rectPath(10, 10, 5, 5)])], {
      accessoryId: 'rot',
      objectDiameter: 72,
    });
    const { payload } = laserPeckerEncoder.encode(compileInput(round, { profile: lp }), {
      dpi: 254,
      px: 4,
      packed: false,
    });
    expect(payload).toMatchObject({ accessory: 'rotary', objectDiameter: 72 });
    expect(payload?.parts).toHaveLength(1);
  });
});

describe('text with letters no font could draw', () => {
  it('burns what it can and says which letters are missing', () => {
    const text = {
      ...vectorObject('t', 'a', [rectPath(10, 10, 5, 5)]),
      kind: 'text' as const,
      text: 'Hi 中',
      fontFamily: 'Geist',
      fontSize: 10,
      fontWeight: 400,
      italic: false,
      align: 'left' as const,
      lineHeight: 1.2,
      letterSpacing: 0,
      missingGlyphs: ['中'],
    };
    const plan = compileJob(compileInput(project([lines('a')], [text]), { profile: profile() }));
    const warning = plan.warnings.find((w) => w.code === 'text-missing-glyphs');
    expect(warning).toMatchObject({ blocking: false });
    expect(warning?.message).toContain('中');
    expect(plan.gcode.length).toBeGreaterThan(5);
  });
});
