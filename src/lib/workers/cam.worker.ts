/// <reference lib="webworker" />
import { compileJob } from 'libopenlaser/cam';
import { encodeJob } from 'libopenlaser/cam';
import { ditherPreview } from 'libopenlaser/cam';
import type { MoveList, RasterSource } from 'libopenlaser/cam';
import { parseGcode, splitGcodeLines, validateGcodeLines } from 'libopenlaser/import';
import { decodeImage } from 'libopenlaser/import';
import type { Project } from 'libopenlaser/project';
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

/** Typed-array buffers in a payload (a few levels deep), so they move to the UI without a copy. */
function buffersIn(payload: unknown, depth = 3): Transferable[] {
  if (ArrayBuffer.isView(payload)) return [payload.buffer as ArrayBuffer];
  if (!payload || typeof payload !== 'object' || depth === 0) return [];
  return Object.values(payload).flatMap((v) => buffersIn(v, depth - 1));
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
        absoluteOrigin: request.absoluteOrigin,
      });
      const moves = parseGcode(plan.gcode.join('\n'), { maxS: request.profile.maxS, yAxis: plan.yAxis });
      const result = {
        gcode: plan.gcode,
        bounds: plan.bounds,
        offset: plan.offset,
        layerStarts: plan.layerStarts,
        stats: plan.stats,
        warnings: plan.warnings,
        moves,
        yAxis: plan.yAxis,
      };
      return { response: { id: request.id, ok: true, result }, transfer: moveTransfer(moves) };
    }
    case 'encode': {
      const assets = await decodeProjectAssets(request.project);
      const input = { project: request.project, assets, profile: request.profile };
      // The encoder's options came through structured clone; it validates what it reads.
      const result = encodeJob(request.encoder, input, request.options as never);
      return {
        response: { id: request.id, ok: true, result },
        transfer: buffersIn(result.payload),
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
