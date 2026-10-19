/** What the pre-flight dialog tells you about the job you are about to burn. */
import type { MoveList, Rect } from '$lib/cam/types';
import type { Project } from '$lib/project/types';

export interface JobSummary {
  name: string;
  /** mm, of the laser-on moves. */
  width: number | null;
  height: number | null;
  estimatedSeconds: number | null;
  /** Highest laser power in the job, percent. */
  maxPower: number;
  /** Output layers, or null for a G-code file. */
  layers: number | null;
  lines: number;
}

export function boundsKey(bounds: Rect | null): string {
  if (!bounds) return 'none';
  return [bounds.minX, bounds.minY, bounds.maxX, bounds.maxY].map((v) => v.toFixed(2)).join(',');
}

/** Peak power from the moves themselves, so it is right for G-code files too. */
export function peakPower(moves: MoveList): number {
  let peak = 0;
  for (let i = 0; i < moves.count; i++) if (moves.power[i] > peak) peak = moves.power[i];
  return Math.round(peak * 100);
}

export function jobSummary(
  job: {
    name: string;
    lines: string[];
    moves: MoveList;
    bounds: Rect | null;
    stats: { estimatedSeconds: number } | null;
  },
  project: Project | null,
): JobSummary {
  const b = job.bounds;
  return {
    name: job.name,
    width: b ? b.maxX - b.minX : null,
    height: b ? b.maxY - b.minY : null,
    estimatedSeconds: job.stats?.estimatedSeconds ?? null,
    maxPower: peakPower(job.moves),
    layers: project
      ? project.layers.filter((l) => l.output && project.objects.some((o) => o.layerId === l.id && o.visible))
          .length
      : null,
    lines: job.lines.length,
  };
}
