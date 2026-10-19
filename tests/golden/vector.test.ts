/**
 * Golden G-code for vector cases (SPEC §12). Each case folder holds settings.json (layers, shapes
 * built from rect/circle/poly primitives, optional profile and job settings) and expected.gcode.
 */
import { describe, expect, it } from 'vitest';
import { compileJob, MAX_LINE_LENGTH } from '$lib/cam';
import type { CompileInput } from '$lib/cam/types';
import type { JobSettings, Layer, MachineProfile, Mat2D, PathData, Vec2 } from '$lib/project/types';
import {
  circlePath,
  compileInput,
  layer,
  polyPath,
  profile,
  project,
  rectPath,
  vectorObject,
} from '../unit/cam/fixtures';
import { interpretGcode } from '../unit/cam/gcode-interpreter';
import { expectGolden, readFixture } from './helpers';

type Shape =
  | { rect: [number, number, number, number] }
  | { circle: [number, number, number] }
  | { poly: [number, number][]; closed?: boolean };

interface VectorCase {
  description: string;
  tolerance?: number;
  profile?: Partial<MachineProfile>;
  jobSettings?: Partial<JobSettings>;
  machinePosition?: Vec2;
  layers: (Partial<Layer> & { id: string })[];
  objects: { id: string; layerId: string; transform?: Mat2D; shapes: Shape[] }[];
}

const CASES = [
  'vector-rectangle-cut',
  'vector-nested-inner-first',
  'vector-compound-fill-evenodd',
  'vector-fill-45',
  'vector-bidirectional-overscan',
  'vector-kerf-offset',
  'vector-origin-current-position',
];

function shapePath(shape: Shape): PathData {
  if ('rect' in shape) return rectPath(...shape.rect);
  if ('circle' in shape) return circlePath(...shape.circle);
  return polyPath(shape.poly, shape.closed ?? true);
}

function loadCase(name: string): CompileInput {
  const spec = JSON.parse(readFixture(name, 'settings.json')) as VectorCase;
  const objects = spec.objects.map((o) =>
    vectorObject(o.id, o.layerId, o.shapes.map(shapePath), o.transform),
  );
  return compileInput(project(spec.layers.map(layer), objects, spec.jobSettings), {
    profile: profile(spec.profile),
    machinePosition: spec.machinePosition,
    tolerance: spec.tolerance,
  });
}

describe('vector golden files', () => {
  for (const name of CASES) {
    it(name, () => {
      const input = loadCase(name);
      const plan = compileJob(input);
      expect(plan.warnings).toEqual([]);
      for (const line of plan.gcode) expect(line.length).toBeLessThan(MAX_LINE_LENGTH);
      const full = compileJob({ ...input, gcode: { optimize: false } });
      expect(interpretGcode(plan.gcode)).toEqual(interpretGcode(full.gcode));
      expectGolden(name, plan.gcode);
    });
  }
});
