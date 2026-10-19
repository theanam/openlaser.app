/**
 * The compiled job for the open project, refreshed in a worker while Preview is showing, and on
 * demand before Frame, Start job and Export. A G-code document skips compiling.
 */
import type { CamWarning, JobStats, MoveList, Rect } from '$lib/cam/types';
import type { CompileResult } from '$lib/workers/protocol';
import { reportError } from '$lib/ui/errors';
import { compileInWorker, SupersededError } from '../lib/cam-client';
import { editor } from './editor.svelte';
import { machine } from './machine.svelte';
import { preferences } from './preferences.svelte';
import { profiles } from './profiles.svelte';

export interface JobSource {
  name: string;
  lines: string[];
  moves: MoveList;
  bounds: Rect | null;
  stats: JobStats | null;
  warnings: CamWarning[];
}

const DEBOUNCE_MS = 250;

class Preview {
  result = $state.raw<CompileResult | null>(null);
  compiling = $state(false);
  error = $state<string | null>(null);
  /** Moves shown, from 0 to moves.count. Null shows the whole job. */
  scrub = $state<number | null>(null);
  playing = $state(false);
  private compiledFor: unknown = null;
  private timer: ReturnType<typeof setTimeout> | null = null;
  private inflight: Promise<CompileResult | null> | null = null;

  /** Everything the compile depends on; a new object means the result is stale. */
  private key() {
    return {
      project: editor.project,
      profile: profiles.active,
      position: editor.project?.jobSettings.origin === 'current-position' ? machine.position : null,
      gcode: preferences.value.debug,
    };
  }

  private sameKey(a: unknown, b: unknown): boolean {
    if (!a || !b) return false;
    const x = a as ReturnType<Preview['key']>;
    const y = b as ReturnType<Preview['key']>;
    return (
      x.project === y.project &&
      x.profile === y.profile &&
      x.gcode === y.gcode &&
      x.position?.x === y.position?.x &&
      x.position?.y === y.position?.y
    );
  }

  get stale(): boolean {
    return !this.sameKey(this.compiledFor, this.key());
  }

  /** The job that Start, Frame and Export act on, if ready. */
  get source(): JobSource | null {
    if (editor.gcode) {
      const doc = editor.gcode;
      return {
        name: doc.name,
        lines: doc.lines,
        moves: doc.moves,
        bounds: doc.moves.burnBounds,
        stats: null,
        warnings: [],
      };
    }
    const r = this.result;
    if (!r || !editor.project) return null;
    return {
      name: editor.project.name,
      lines: r.gcode,
      moves: r.moves,
      bounds: r.bounds,
      stats: r.stats,
      warnings: r.warnings,
    };
  }

  /** Schedules a background compile (called by an effect while Preview is visible). */
  schedule(): void {
    if (!editor.project || !this.stale) return;
    if (this.timer) clearTimeout(this.timer);
    this.timer = setTimeout(() => void this.compile(), DEBOUNCE_MS);
  }

  /** Compiles now if needed and returns the up-to-date job. */
  async ensure(): Promise<JobSource | null> {
    if (editor.gcode) return this.source;
    if (!editor.project) return null;
    if (this.stale) await this.compile();
    return this.stale ? null : this.source;
  }

  private async compile(): Promise<CompileResult | null> {
    if (this.timer) clearTimeout(this.timer);
    const key = this.key();
    const project = key.project;
    if (!project) return null;
    if (this.inflight && this.sameKey(this.compiledForPending, key)) return this.inflight;
    this.compiledForPending = key;
    this.compiling = true;
    this.error = null;
    const debug = preferences.value.debug;
    const run = compileInWorker({
      // Raw state: plain objects that structured-clone straight into the worker, Blobs included.
      project,
      profile: key.profile,
      machinePosition: key.position ?? undefined,
      limits: machine.limits,
      gcode: {
        optimize: !debug.disableOptimizer,
        leadingZero: debug.leadingZero,
        comments: debug.gcodeComments,
      },
    })
      .then((result) => {
        this.result = result;
        this.compiledFor = key;
        this.scrub = null;
        return result;
      })
      .catch((error: unknown) => {
        if (error instanceof SupersededError) return null;
        this.error = error instanceof Error ? error.message : String(error);
        reportError(error, 'Compile');
        return null;
      })
      .finally(() => {
        if (this.inflight === run) {
          this.inflight = null;
          this.compiling = false;
        }
      });
    this.inflight = run;
    return run;
  }

  private compiledForPending: unknown = null;

  reset(): void {
    this.result = null;
    this.compiledFor = null;
    this.scrub = null;
    this.playing = false;
    this.error = null;
  }
}

export const preview = new Preview();
