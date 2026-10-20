/// <reference lib="webworker" />
import { compileJob } from '../cam';
import { emitRuida } from '../cam/ruida';
import { ditherPreview } from '../cam/raster';
import type { MoveList, RasterSource } from '../cam/types';
import { parseGcode, splitGcodeLines, validateGcodeLines } from '../import/gcode';
import { decodeImage } from '../import/image';
import type { Project } from '../project/types';
import type { WorkerRequest, WorkerResponse } from './protocol';

declare const self: DedicatedWorkerGlobalScope;

/** Decoded assets, keyed by asset id. Assets are immutable, so the id is a sufficient key. */
const decoded = new Map<string, Promise<RasterSource>>();

function decode(id: string, blob: Blob): Promise<RasterSource> {
  let pending = decoded.get(id);
  if (!pending) {
    pending = decodeImage(blob);
    decoded.set(id, pending);
    pending.catch(() => decoded.delete(id));
  }
  return pending;
}

async function decodeProjectAssets(project: Project): Promise<Map<string, RasterSource>> {
  const used = new Set(project.objects.flatMap((o) => (o.kind === 'image' ? [o.assetId] : [])));
  const out = new Map<string, RasterSource>();
  for (const id of used) {
    const asset = project.assets[id];
    if (asset) out.set(id, await decode(id, asset.data));
  }
  return out;
}

function moveTransfer(moves: MoveList): Transferable[] {
  return [moves.coords.buffer, moves.power.buffer, moves.rapid.buffer, moves.line.buffer];
}

async function handle(
  request: WorkerRequest,
): Promise<{ response: WorkerResponse; transfer: Transferable[] }> {
  switch (request.type) {
    case 'compile': {
      const assets = await decodeProjectAssets(request.project);
      const plan = compileJob({
        project: request.project,
        assets,
        profile: request.profile,
        machinePosition: request.machinePosition,
        limits: request.limits,
        gcode: request.gcode,
      });
      const moves = parseGcode(plan.gcode.join('\n'), { maxS: request.profile.maxS });
      const result = {
        gcode: plan.gcode,
        bounds: plan.bounds,
        stats: plan.stats,
        warnings: plan.warnings,
        moves,
      };
      return { response: { id: request.id, ok: true, result }, transfer: moveTransfer(moves) };
    }
    case 'compile-rd': {
      const assets = await decodeProjectAssets(request.project);
      const plan = compileJob({ project: request.project, assets, profile: request.profile });
      const layers = new Map(request.project.layers.map((l) => [l.id, { color: l.color }]));
      const bytes =
        plan.toolpaths.length > 0
          ? emitRuida(plan.toolpaths, { layers, airAssist: request.profile.supportsAirAssist })
          : new Uint8Array();
      return {
        response: { id: request.id, ok: true, result: { bytes, warnings: plan.warnings } },
        transfer: [bytes.buffer],
      };
    }
    case 'parse-gcode': {
      const lines = splitGcodeLines(request.text);
      const moves = parseGcode(request.text, { maxS: request.maxS });
      const longLines = validateGcodeLines(lines).map((issue) => issue.index);
      return {
        response: { id: request.id, ok: true, result: { lines, moves, longLines } },
        transfer: moveTransfer(moves),
      };
    }
    case 'dither': {
      const source = await decode(request.assetId, request.blob);
      const preview = ditherPreview(
        source,
        request.settings,
        request.layer,
        request.widthMm,
        request.heightMm,
      );
      return { response: { id: request.id, ok: true, result: preview }, transfer: [preview.burn.buffer] };
    }
  }
}

self.onmessage = async (event: MessageEvent<WorkerRequest>) => {
  try {
    const { response, transfer } = await handle(event.data);
    self.postMessage(response, transfer);
  } catch (error) {
    self.postMessage({
      id: event.data.id,
      ok: false,
      error: error instanceof Error ? error.message : String(error),
    } satisfies WorkerResponse);
  }
};
