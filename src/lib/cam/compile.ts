/**
 * compileJob (SPEC §6): project → toolpaths → G-code. Pure and deterministic, safe to run in a
 * worker: no DOM, no clocks, no randomness.
 */
import { DEFAULT_TOLERANCE } from '../geometry/bezier';
import type { Rect, Vec2 } from '../geometry/types';
import { boundsWarning, speedWarning } from './checks';
import { DEFAULT_GCODE_OPTIONS, emitGcode, type Move } from './gcode/emit';
import { estimateSeconds } from './gcode/estimate';
import { layerToolpath, toolpathEnd } from './layers';
import { layerJobObjects, outputLayers } from './objects';
import { jobOrigin, originOffset } from './origin';
import { burnBounds, translateToolpaths } from './toolpath';
import type { CamWarning, CompileInput, JobPlan, JobStats, Toolpath } from './types';

export function compileJob(input: CompileInput): JobPlan {
  const { profile } = input;
  // Ruida jobs run from the controller's panel at bed positions; there is no live head to anchor to.
  const project =
    profile.controller === 'ruida'
      ? { ...input.project, jobSettings: { ...input.project.jobSettings, origin: 'absolute' as const } }
      : input.project;
  const options = { ...DEFAULT_GCODE_OPTIONS, ...input.gcode };
  const tolerance = input.tolerance ?? DEFAULT_TOLERANCE;
  const warnings: CamWarning[] = [];
  const designToolpaths: Toolpath[] = [];
  let position: Vec2 = { x: 0, y: 0 };

  for (const layer of outputLayers(project)) {
    const result = layerToolpath(layer, layerJobObjects(project, layer), {
      assets: input.assets,
      tolerance,
      optimizeOrder: project.jobSettings.optimizeOrder,
      position,
    });
    warnings.push(...result.warnings);
    if (!result.toolpath) continue;
    // CO₂ tubes stop firing when M4 scales power down at corners: they burn at constant power.
    designToolpaths.push(
      profile.constantPower ? { ...result.toolpath, laserMode: 'constant' } : result.toolpath,
    );
    position = toolpathEnd(result.toolpath);
    const speed = speedWarning(layer, input.limits);
    if (speed) warnings.push(speed);
  }

  if (designToolpaths.length === 0) {
    warnings.push({
      code: 'empty-job',
      message: 'Nothing to burn: no output layer has visible objects.',
      blocking: true,
    });
    return {
      toolpaths: [],
      gcode: [],
      bounds: null,
      offset: { x: 0, y: 0 },
      layerStarts: [],
      stats: emptyStats(),
      warnings,
    };
  }

  const offset = originOffset(
    burnBounds(designToolpaths),
    project.jobSettings,
    profile,
    input.machinePosition,
  );
  const toolpaths = translateToolpaths(designToolpaths, offset.x, offset.y);
  const origin = jobOrigin(project.jobSettings, input.machinePosition);
  const { lines, moves, layerStarts } = emitGcode(toolpaths, {
    maxS: profile.maxS,
    header: profile.gcodeHeader,
    footer: profile.gcodeFooter,
    airAssist: profile.supportsAirAssist && toolpaths.some((tp) => tp.airAssist),
    returnTo: project.jobSettings.returnToOrigin ? origin : null,
    start: origin,
    options,
    layerNames: new Map(project.layers.map((l) => [l.id, l.name])),
  });

  const outside = boundsWarning(moves, profile);
  if (outside) warnings.push(outside);
  return {
    toolpaths,
    gcode: lines,
    bounds: movesBurnBounds(moves),
    offset,
    layerStarts,
    stats: jobStats(lines, moves, input.limits),
    warnings,
  };
}

/**
 * Burn distance counts G1 moves with S > 0; everything else (G0 and laser-off G1 such as overscan
 * and short fill gaps) counts as travel.
 */
export function jobStats(
  lines: readonly string[],
  moves: readonly Move[],
  limits: CompileInput['limits'],
): JobStats {
  let byteCount = 0;
  for (const line of lines) byteCount += line.length + 1;
  let burnDistance = 0;
  let travelDistance = 0;
  for (const m of moves) {
    const d = Math.hypot(m.x1 - m.x0, m.y1 - m.y0);
    if (!m.rapid && m.s > 0) burnDistance += d;
    else travelDistance += d;
  }
  return {
    lineCount: lines.length,
    byteCount,
    burnDistance,
    travelDistance,
    estimatedSeconds: estimateSeconds(moves, limits),
  };
}

function movesBurnBounds(moves: readonly Move[]): Rect | null {
  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  for (const m of moves) {
    if (m.rapid || m.s <= 0) continue;
    minX = Math.min(minX, m.x0, m.x1);
    maxX = Math.max(maxX, m.x0, m.x1);
    minY = Math.min(minY, m.y0, m.y1);
    maxY = Math.max(maxY, m.y0, m.y1);
  }
  return minX === Infinity ? null : { minX, minY, maxX, maxY };
}

function emptyStats(): JobStats {
  return { lineCount: 0, byteCount: 0, burnDistance: 0, travelDistance: 0, estimatedSeconds: 0 };
}
