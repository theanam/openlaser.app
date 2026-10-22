/** Drag state shared by the Layers panel and its rows: a layer being reordered or objects moving. */
import type { Id } from '$lib/project/types';

export type LayerDrag = { kind: 'layer'; index: number } | { kind: 'object'; ids: Id[] };

export class LayerDragState {
  drag = $state.raw<LayerDrag | null>(null);
  /** Reorder target: the dragged layer lands before this index. */
  dropIndex = $state<number | null>(null);
  /** Move target: dragged objects land on this layer. */
  dropLayerId = $state<Id | null>(null);

  startLayer(index: number): void {
    this.drag = { kind: 'layer', index };
  }

  startObjects(ids: Id[]): void {
    this.drag = { kind: 'object', ids };
  }

  /** Called on dragover of a layer row: `before` is true in the row's upper half. */
  over(index: number, layerId: Id, before: boolean): void {
    if (this.drag?.kind === 'layer') this.dropIndex = before ? index : index + 1;
    else if (this.drag?.kind === 'object') this.dropLayerId = layerId;
  }

  reset(): void {
    this.drag = null;
    this.dropIndex = null;
    this.dropLayerId = null;
  }
}
