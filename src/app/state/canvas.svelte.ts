/** Canvas viewport state shared with the zoom control, status bar and shortcuts. */
import type { PathData, Rect, Vec2 } from '$lib/geometry/types';
import { clampZoom, fitBed, fitRect, zoomAt, type BedFrame, type View } from '../canvas/viewport';

class CanvasState {
  view = $state<View>({ zoom: 1.5, offsetX: 40, offsetY: 40 });
  size = $state({ width: 800, height: 600 });
  /** Pointer position in bed mm, null when outside the canvas. */
  cursor = $state<Vec2 | null>(null);
  /** Set until the first fit, so the bed starts centered. */
  fitted = false;
  /** Measure tool result. */
  measure = $state<{ from: Vec2; to: Vec2 } | null>(null);
  /** Text object being edited in place on the bed. */
  editingTextId = $state<string | null>(null);
  /** Select the whole text when editing starts (a fresh placeholder), else put the caret at the end. */
  selectTextOnEdit = false;
  /** Outline tool preview in bed mm, while its options are open. */
  outlinePreview = $state.raw<PathData[] | null>(null);

  editText(id: string, selectAll = false): void {
    this.selectTextOnEdit = selectAll;
    this.editingTextId = id;
  }

  fit(bed: BedFrame): void {
    this.view = fitBed(this.size, bed, 40);
    this.fitted = true;
  }

  fitTo(bed: BedFrame, r: Rect): void {
    this.view = fitRect(this.size, bed, r, 80);
  }

  zoomBy(factor: number): void {
    this.view = zoomAt(this.view, factor, { x: this.size.width / 2, y: this.size.height / 2 });
  }

  /** Zoom where 100% means one bed mm per CSS mm (96 dpi). */
  get percent(): number {
    return Math.round((this.view.zoom / (96 / 25.4)) * 100);
  }

  setZoom(zoom: number): void {
    this.view = zoomAt(this.view, clampZoom(zoom) / this.view.zoom, {
      x: this.size.width / 2,
      y: this.size.height / 2,
    });
  }
}

export const canvas = new CanvasState();
