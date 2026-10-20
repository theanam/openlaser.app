/**
 * Editor state: the open project, selection, tools and undo history. Every project mutation goes
 * through `commit`, which records an undo step and marks the document dirty.
 */
import type { MoveList } from '$lib/cam/types';
import { defaultLayer, LAYER_PALETTE, MODE_COLORS } from '$lib/import/layer-defaults';
import { createProject } from '$lib/project/factory';
import { History } from '$lib/project/history';
import { makeId } from '$lib/project/ids';
import * as ops from '$lib/project/operations';
import { keepsAspectByDefault } from '../lib/selection';
import type { Anchor, Asset, Id, Layer, LayerMode, Project, SceneObject } from '$lib/project/types';

export type Tool = 'select' | 'pan' | 'rect' | 'ellipse' | 'shape' | 'text' | 'measure';
export type ViewMode = 'design' | 'preview';

/** A G-code file opened in sender mode: it bypasses design and CAM. */
export interface GcodeDocument {
  name: string;
  lines: string[];
  moves: MoveList;
}

export class Editor {
  project = $state.raw<Project | null>(null);
  selection = $state.raw<ReadonlySet<Id>>(new Set());
  activeLayerId = $state<Id | null>(null);
  tool = $state<Tool>('select');
  /** Shape the Shapes tool draws. */
  shapeKind = $state('star');
  /** Reference point for the X/Y/W/H fields and scaling. */
  anchor = $state<Anchor>('bl');
  /** The chain button's choice, for the selection it was made on; other selections use their default. */
  private aspectChoice = $state<{ selection: string; keep: boolean } | null>(null);

  /** Keep proportions when resizing: on for text, images and imported art unless the user unlinks. */
  get keepAspect(): boolean {
    const key = [...this.selection].sort().join(' ');
    if (this.aspectChoice?.selection === key) return this.aspectChoice.keep;
    const project = this.project;
    return project ? keepsAspectByDefault(project.objects.filter((o) => this.selection.has(o.id))) : false;
  }

  set keepAspect(keep: boolean) {
    this.aspectChoice = { selection: [...this.selection].sort().join(' '), keep };
  }
  view = $state<ViewMode>('design');
  gcode = $state.raw<GcodeDocument | null>(null);
  /** Changes since the last save to a file. */
  dirty = $state(false);
  fileName = $state<string | null>(null);
  fileHandle: FileSystemFileHandle | null = null;
  /** Bumps on every history change so canUndo/canRedo stay reactive. */
  private historyTick = $state(0);
  private history = new History<Project>();

  get canUndo(): boolean {
    void this.historyTick;
    return this.history.canUndo;
  }

  get canRedo(): boolean {
    void this.historyTick;
    return this.history.canRedo;
  }

  get activeLayer(): Layer | null {
    return this.project?.layers.find((l) => l.id === this.activeLayerId) ?? null;
  }

  get hasDocument(): boolean {
    return this.project !== null || this.gcode !== null;
  }

  /** Applies a pure project operation as one undoable step. */
  commit(change: (project: Project) => Project, options: { coalesce?: string; record?: boolean } = {}): void {
    const current = this.project;
    if (!current) return;
    const next = change(current);
    if (next === current) return;
    // `record: false` is for derived data (text outlines) that follows an edit already on the stack.
    if (options.record !== false) this.history.record(current, options.coalesce ?? null);
    // A layer only exists while it has something on it.
    this.project = { ...ops.dropEmptyLayers(next), updatedAt: new Date().toISOString() };
    this.dirty = true;
    this.historyTick++;
    this.pruneSelection();
  }

  /** Ends a coalescing run (end of a drag or scrub). */
  sealHistory(): void {
    this.history.seal();
  }

  undo(): void {
    if (!this.project) return;
    const previous = this.history.undo(this.project);
    if (previous) this.restore(previous);
  }

  redo(): void {
    if (!this.project) return;
    const next = this.history.redo(this.project);
    if (next) this.restore(next);
  }

  private restore(project: Project): void {
    this.project = project;
    this.dirty = true;
    this.historyTick++;
    this.pruneSelection();
  }

  private pruneSelection(): void {
    const project = this.project;
    if (!project) return;
    if (this.selection.size) {
      const ids = new Set(project.objects.map((o) => o.id));
      const kept = [...this.selection].filter((id) => ids.has(id));
      if (kept.length !== this.selection.size) this.selection = new Set(kept);
    }
    if (!project.layers.some((l) => l.id === this.activeLayerId)) {
      this.activeLayerId = project.layers[0]?.id ?? null;
    }
  }

  open(project: Project, file: { name?: string | null; handle?: FileSystemFileHandle | null } = {}): void {
    this.project = ops.dropEmptyLayers(project);
    this.gcode = null;
    this.selection = new Set();
    this.activeLayerId = project.layers[0]?.id ?? null;
    this.history.clear();
    this.historyTick++;
    this.dirty = false;
    this.fileName = file.name ?? null;
    this.fileHandle = file.handle ?? null;
    this.view = 'design';
    this.tool = 'select';
  }

  newProject(machineProfileId: Id | null, name = 'Untitled'): void {
    this.open(createProject({ name, machineProfileId }));
  }

  openGcode(doc: GcodeDocument): void {
    this.project = null;
    this.gcode = doc;
    this.selection = new Set();
    this.history.clear();
    this.historyTick++;
    this.dirty = false;
    this.fileName = doc.name;
    this.fileHandle = null;
    this.view = 'preview';
  }

  close(): void {
    this.project = null;
    this.gcode = null;
    this.selection = new Set();
    this.history.clear();
    this.historyTick++;
    this.dirty = false;
    this.fileName = null;
    this.fileHandle = null;
    this.view = 'design';
  }

  select(ids: Iterable<Id>, mode: 'replace' | 'toggle' | 'add' = 'replace'): void {
    const next = mode === 'replace' ? new Set<Id>() : new Set(this.selection);
    for (const id of ids) {
      if (mode === 'toggle' && next.has(id)) next.delete(id);
      else next.add(id);
    }
    this.selection = next;
    // Selecting objects on one layer makes it the active layer, so its settings show.
    const first = this.project?.objects.find((o) => next.has(o.id));
    if (first) this.activeLayerId = first.layerId;
  }

  selectAll(): void {
    this.select(this.project?.objects.filter((o) => o.visible && !o.locked).map((o) => o.id) ?? []);
  }

  clearSelection(): void {
    if (this.selection.size) this.selection = new Set();
  }

  /**
   * The layer new art of this mode goes on: the active layer when it fits, else the first such
   * layer, else a new one. A new layer is returned uncommitted, so it is added in the same step as
   * its objects (layers are never empty).
   */
  layerFor(mode: LayerMode): { id: Id; created: Layer | null } {
    const project = this.project;
    if (!project) throw new Error('No project is open.');
    const active = this.activeLayer;
    if (active && (active.mode === mode || (mode !== 'image' && active.mode !== 'image')))
      return { id: active.id, created: null };
    const existing = project.layers.find((l) => l.mode === mode);
    if (existing) return { id: existing.id, created: null };
    const layer = this.makeLayer(mode);
    return { id: layer.id, created: layer };
  }

  /** Adds new objects (built for their layer) and their layer if it is new, as one undo step. */
  addOnLayer<T extends SceneObject>(mode: LayerMode, build: (layerId: Id) => T[], assets: Asset[] = []): T[] {
    const { id, created } = this.layerFor(mode);
    const objects = build(id);
    if (objects.length === 0) return objects;
    this.commit((p) => ops.addObjects(created ? ops.addLayer(p, created) : p, objects, assets));
    this.activeLayerId = id;
    this.select(objects.map((o) => o.id));
    return objects;
  }

  makeLayer(mode: LayerMode, color?: string): Layer {
    const used = new Set(this.project?.layers.map((l) => l.color.toLowerCase()) ?? []);
    const preferred = color ?? MODE_COLORS[mode];
    const pick = used.has(preferred.toLowerCase())
      ? (LAYER_PALETTE.find((p) => !used.has(p.color.toLowerCase()))?.color ?? preferred)
      : preferred;
    const count = (this.project?.layers.filter((l) => l.mode === mode).length ?? 0) + 1;
    const base = defaultLayer({ id: makeId(), mode, color: pick });
    return { ...base, name: count > 1 ? `${base.name} ${count}` : base.name };
  }
}

export const editor = new Editor();
