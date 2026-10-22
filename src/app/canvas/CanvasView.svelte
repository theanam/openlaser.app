<script lang="ts">
  import { onMount } from 'svelte';
  import Minus from '@lucide/svelte/icons/minus';
  import Plus from '@lucide/svelte/icons/plus';
  import Maximize from '@lucide/svelte/icons/maximize';
  import { IDENTITY, multiply, rotationAbout, translation } from '$lib/geometry/mat2d';
  import type { Mat2D, Rect, Vec2 } from '$lib/geometry/types';
  import { setObjectTransforms } from '$lib/project/operations';
  import { makeId } from '$lib/project/ids';
  import type { Id, SceneObject } from '$lib/project/types';
  import { editor } from '../state/editor.svelte';
  import { canvas } from '../state/canvas.svelte';
  import { preview } from '../state/preview.svelte';
  import { profiles } from '../state/profiles.svelte';
  import { machine } from '../state/machine.svelte';
  import { boundsOf, selectedObjects } from '../lib/selection';
  import { bedRectToScreen, bedToScreen, screenToBed, zoomAt, type BedFrame } from './viewport';
  import {
    drawBed,
    drawDashedRect,
    drawLaserHead,
    drawObjectHighlight,
    drawObjects,
    drawRulers,
    readPalette,
    screenPath,
  } from './scene-render';
  import { drawMeasure, drawSelection, drawShapeGhost, drawSizeLabel } from './overlays';
  import { hitObject } from './hit-test';
  import { drawPreview, headAt, previewGeometry } from './preview-render';
  import {
    angleAround,
    handlesFor,
    hitHandle,
    normalizeRect,
    oppositeHandle,
    scaleFromDrag,
    selectionBox,
    snapAngle,
    type Handle,
    type HandleId,
  } from './handles';
  import { ImageLooks } from './image-cache';
  import { cursorFor, marqueeHits, shapeObject, type DrawnShape } from './tools';
  import { textOutlines } from '../state/text.svelte';
  import { ui } from '../state/ui.svelte';
  import TextEditOverlay from './TextEditOverlay.svelte';

  let host: HTMLDivElement;
  let el: HTMLCanvasElement;
  let ctx: CanvasRenderingContext2D | null = null;
  let frame = 0;
  let spaceHeld = $state(false);
  let hoverHandle = $state<HandleId | null>(null);

  const images = new ImageLooks(() => invalidate());

  const bed: BedFrame = $derived({
    width: profiles.active.bedWidth,
    height: profiles.active.bedHeight,
    originCorner: profiles.active.originCorner,
  });

  type Drag =
    | { kind: 'pan'; x: number; y: number; offsetX: number; offsetY: number }
    | { kind: 'move'; start: Vec2; originals: Map<Id, Mat2D>; moved: boolean }
    | {
        kind: 'scale';
        handle: Exclude<HandleId, 'rotate'>;
        pivot: Vec2;
        start: Vec2;
        originals: Map<Id, Mat2D>;
      }
    | { kind: 'rotate'; center: Vec2; startAngle: number; originals: Map<Id, Mat2D> }
    | { kind: 'marquee'; start: Vec2; current: Vec2; additive: boolean }
    | { kind: 'shape'; shape: DrawnShape; start: Vec2; current: Vec2 }
    | { kind: 'measure' };

  let drag = $state.raw<Drag | null>(null);

  const designing = $derived(editor.view === 'design' && editor.project !== null && editor.gcode === null);
  const selection = $derived(
    editor.project && designing ? selectedObjects(editor.project, editor.selection) : [],
  );
  const selectionBounds = $derived(boundsOf(selection));
  const rotatable = $derived(selection.length > 0 && selection.every((o) => o.kind !== 'image'));
  /** Objects that glow because their row in the Layers panel is hovered. */
  const highlighted = $derived.by((): ReadonlySet<string> => {
    if (ui.hoverObjectId) return new Set([ui.hoverObjectId]);
    const layerId = ui.hoverLayerId;
    if (!layerId || !editor.project) return new Set();
    return new Set(editor.project.objects.filter((o) => o.layerId === layerId).map((o) => o.id));
  });

  function invalidate() {
    if (frame) return;
    frame = requestAnimationFrame(() => {
      frame = 0;
      draw();
    });
  }

  $effect(() => {
    // Everything the picture depends on; reading it registers the dependency.
    void [
      editor.project,
      editor.selection,
      editor.view,
      editor.gcode,
      canvas.view,
      canvas.size,
      canvas.measure,
      canvas.outlinePreview,
      canvas.editingTextId,
      bed,
      drag,
    ];
    void [preview.result, preview.scrub, machine.headPosition, hoverHandle, highlighted];
    invalidate();
  });

  function selectionHandles(): Handle[] {
    if (!selectionBounds) return [];
    return handlesFor(selectionBox(bedRectToScreen(canvas.view, bed, selectionBounds)), rotatable);
  }

  function draw() {
    if (!ctx) return;
    const dpr = window.devicePixelRatio || 1;
    const { width, height } = canvas.size;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    const palette = readPalette(el);
    bedColor = palette.bed;
    drawBed(ctx, canvas.view, bed, palette, canvas.size);

    const project = editor.project;
    const moves = editor.gcode?.moves ?? (editor.view === 'preview' ? preview.result?.moves : undefined);
    if (editor.view === 'preview' || editor.gcode) {
      if (moves) {
        const geometry = previewGeometry(moves);
        const upTo = preview.scrub ?? moves.count;
        drawPreview(ctx, geometry, upTo, canvas.view, bed, {
          burnLow: palette.signalSoft,
          burnHigh: palette.signal,
          travel: palette.beam,
        });
        if (preview.scrub !== null) {
          const at = headAt(moves, upTo);
          if (at) drawLaserHead(ctx, bedToScreen(canvas.view, bed, at), palette);
        }
      }
    } else if (project) {
      drawObjects(
        ctx,
        project,
        canvas.view,
        bed,
        (object, layer) => images.look(object, layer, project.assets[object.assetId]),
        palette,
        canvas.editingTextId,
      );
      if (highlighted.size) drawObjectHighlight(ctx, project, highlighted, canvas.view, bed, palette);
      if (selectionBounds) {
        const box = selectionBox(bedRectToScreen(canvas.view, bed, selectionBounds));
        drawSelection(ctx, box, selectionHandles(), palette);
        drawSizeLabel(
          ctx,
          box,
          selectionBounds.maxX - selectionBounds.minX,
          selectionBounds.maxY - selectionBounds.minY,
          palette,
        );
      }
    }

    if (drag?.kind === 'marquee')
      drawDashedRect(ctx, normalizeRect(drag.start, drag.current), palette.beam, 0.08);
    if (drag?.kind === 'shape') {
      if (typeof drag.shape === 'string')
        drawShapeGhost(ctx, canvas.view, bed, drag.shape, drag.start, drag.current, palette.signal);
      else {
        // Library shapes preview with their real outline.
        const ghost = shapeObject(drag.shape, normalizeRect(drag.start, drag.current), '', '');
        if (ghost) {
          ctx.strokeStyle = palette.signal;
          ctx.lineWidth = 1.4;
          ctx.stroke(screenPath(ghost, canvas.view, bed));
        }
      }
    }
    if (canvas.outlinePreview?.length) {
      ctx.save();
      ctx.setLineDash([6, 4]);
      ctx.strokeStyle = palette.signal;
      ctx.lineWidth = 1.5;
      ctx.stroke(screenPath({ paths: canvas.outlinePreview, transform: IDENTITY }, canvas.view, bed));
      ctx.restore();
    }
    if (canvas.measure) drawMeasure(ctx, canvas.view, bed, canvas.measure.from, canvas.measure.to, palette);

    const head = machine.headPosition;
    if (head && preview.scrub === null) drawLaserHead(ctx, bedToScreen(canvas.view, bed, head), palette);
    drawRulers(ctx, canvas.view, bed, palette, { width, height });
  }

  // ---------------------------------------------------------------- input

  function local(event: { clientX: number; clientY: number }): Vec2 {
    const r = el.getBoundingClientRect();
    return { x: event.clientX - r.left, y: event.clientY - r.top };
  }

  function hitAt(screen: Vec2): SceneObject | null {
    return editor.project && ctx ? hitObject(ctx, editor.project, canvas.view, bed, screen) : null;
  }

  function originals(): Map<Id, Mat2D> {
    return new Map(selection.filter((o) => !o.locked).map((o) => [o.id, o.transform]));
  }

  function commitTransforms(source: Map<Id, Mat2D>, matrix: Mat2D) {
    const next = new Map<Id, Mat2D>();
    for (const [id, t] of source) next.set(id, multiply(matrix, t));
    editor.commit((p) => setObjectTransforms(p, next), { coalesce: 'canvas-drag' });
  }

  function onpointerdown(event: PointerEvent) {
    el.focus({ preventScroll: true });
    const screen = local(event);
    const bedPoint = screenToBed(canvas.view, bed, screen);
    const panning =
      event.button === 1 || spaceHeld || editor.tool === 'pan' || (!designing && editor.tool !== 'measure');
    if (event.button !== 0 && event.button !== 1) return;
    el.setPointerCapture(event.pointerId);
    if (panning) {
      drag = {
        kind: 'pan',
        x: event.clientX,
        y: event.clientY,
        offsetX: canvas.view.offsetX,
        offsetY: canvas.view.offsetY,
      };
      return;
    }
    if (editor.tool === 'measure') {
      canvas.measure = { from: bedPoint, to: bedPoint };
      drag = { kind: 'measure' };
      return;
    }
    if (editor.tool === 'rect' || editor.tool === 'ellipse' || editor.tool === 'shape') {
      const shape: DrawnShape = editor.tool === 'shape' ? { library: editor.shapeKind } : editor.tool;
      drag = { kind: 'shape', shape, start: bedPoint, current: bedPoint };
      return;
    }
    if (editor.tool === 'text') {
      // Keep the browser from focusing the canvas on mouse-down, which would steal the caret.
      event.preventDefault();
      el.releasePointerCapture(event.pointerId);
      canvas.editText(textOutlines.create(bedPoint), true);
      editor.tool = 'select';
      return;
    }
    const handle = hitHandle(screen, selectionHandles());
    if (handle && selectionBounds) {
      if (handle.id === 'rotate') {
        const center = {
          x: (selectionBounds.minX + selectionBounds.maxX) / 2,
          y: (selectionBounds.minY + selectionBounds.maxY) / 2,
        };
        drag = { kind: 'rotate', center, startAngle: angleAround(center, bedPoint), originals: originals() };
      } else {
        const box = selectionBox(bedRectToScreen(canvas.view, bed, selectionBounds));
        const handles = handlesFor(box, false);
        const opposite = handles.find(
          (h) => h.id === oppositeHandle(handle.id as Exclude<HandleId, 'rotate'>),
        )!;
        const pivot = screenToBed(canvas.view, bed, opposite);
        const start = screenToBed(canvas.view, bed, handle);
        drag = {
          kind: 'scale',
          handle: handle.id as Exclude<HandleId, 'rotate'>,
          pivot,
          start,
          originals: originals(),
        };
      }
      return;
    }
    const hit = hitAt(screen);
    if (hit) {
      if (event.shiftKey) editor.select([hit.id], 'toggle');
      else if (!editor.selection.has(hit.id)) editor.select([hit.id]);
      drag = { kind: 'move', start: bedPoint, originals: originals(), moved: false };
    } else {
      if (!event.shiftKey) editor.clearSelection();
      drag = { kind: 'marquee', start: screen, current: screen, additive: event.shiftKey };
    }
  }

  function onpointermove(event: PointerEvent) {
    const screen = local(event);
    const bedPoint = screenToBed(canvas.view, bed, screen);
    canvas.cursor = bedPoint;
    const d = drag;
    if (!d) {
      hoverHandle =
        designing && editor.tool === 'select' ? (hitHandle(screen, selectionHandles())?.id ?? null) : null;
      return;
    }
    switch (d.kind) {
      case 'pan':
        canvas.view = {
          ...canvas.view,
          offsetX: d.offsetX + event.clientX - d.x,
          offsetY: d.offsetY + event.clientY - d.y,
        };
        break;
      case 'move': {
        let dx = bedPoint.x - d.start.x;
        let dy = bedPoint.y - d.start.y;
        if (event.shiftKey) {
          if (Math.abs(dx) > Math.abs(dy)) dy = 0;
          else dx = 0;
        }
        if (!d.moved && Math.hypot(dx, dy) * canvas.view.zoom < 3) return;
        d.moved = true;
        commitTransforms(d.originals, translation(dx, dy));
        break;
      }
      case 'scale':
        // Shift flips the selection's aspect setting for this drag.
        commitTransforms(
          d.originals,
          scaleFromDrag(d.handle, d.pivot, d.start, bedPoint, editor.keepAspect !== event.shiftKey),
        );
        break;
      case 'rotate': {
        let delta = angleAround(d.center, bedPoint) - d.startAngle;
        if (event.shiftKey) delta = snapAngle(delta);
        commitTransforms(d.originals, rotationAbout(delta, d.center.x, d.center.y));
        break;
      }
      case 'marquee':
        drag = { ...d, current: screen };
        break;
      case 'shape':
        drag = { ...d, current: event.shiftKey ? square(d.start, bedPoint) : bedPoint };
        break;
      case 'measure':
        if (canvas.measure) canvas.measure = { from: canvas.measure.from, to: bedPoint };
        break;
    }
  }

  function square(a: Vec2, b: Vec2): Vec2 {
    const s = Math.max(Math.abs(b.x - a.x), Math.abs(b.y - a.y));
    return { x: a.x + Math.sign(b.x - a.x || 1) * s, y: a.y + Math.sign(b.y - a.y || 1) * s };
  }

  function onpointerup(event: PointerEvent) {
    const d = drag;
    drag = null;
    if (el.hasPointerCapture(event.pointerId)) el.releasePointerCapture(event.pointerId);
    if (!d) return;
    if (d.kind === 'move' || d.kind === 'scale' || d.kind === 'rotate') editor.sealHistory();
    if (d.kind === 'marquee') {
      const box = normalizeRect(d.start, d.current);
      if (box.maxX - box.minX < 3 && box.maxY - box.minY < 3) return;
      if (editor.project)
        editor.select(marqueeHits(editor.project, canvas.view, bed, box), d.additive ? 'add' : 'replace');
    }
    if (d.kind === 'shape') createShape(d.shape, normalizeRect(d.start, d.current));
  }

  function ondblclick(event: MouseEvent) {
    if (!designing) return;
    const hit = hitAt(local(event));
    if (hit?.kind === 'text' && !hit.locked) {
      editor.select([hit.id]);
      canvas.editText(hit.id);
    }
  }

  function createShape(shape: DrawnShape, r: Rect) {
    if (!shapeObject(shape, r, '', '')) return;
    editor.addOnLayer('line', (layerId) => [shapeObject(shape, r, layerId, makeId())!]);
    // One shape per pick of the tool; back to Select so the new shape can be adjusted right away.
    editor.tool = 'select';
  }

  function onwheel(event: WheelEvent) {
    event.preventDefault();
    const screen = local(event);
    const mouseWheel =
      event.deltaMode !== 0 ||
      (event.deltaX === 0 && Math.abs(event.deltaY) >= 50 && Number.isInteger(event.deltaY));
    if (event.ctrlKey || event.metaKey || mouseWheel) {
      const factor = Math.exp(-event.deltaY * (event.deltaMode === 1 ? 0.05 : event.ctrlKey ? 0.01 : 0.002));
      canvas.view = zoomAt(canvas.view, factor, screen);
    } else {
      canvas.view = {
        ...canvas.view,
        offsetX: canvas.view.offsetX - event.deltaX,
        offsetY: canvas.view.offsetY - event.deltaY,
      };
    }
  }

  const cursor = $derived(
    cursorFor({
      drag: drag?.kind ?? null,
      panning: spaceHeld || editor.tool === 'pan' || (!designing && editor.tool !== 'measure'),
      tool: editor.tool,
      handle: hoverHandle,
    }),
  );

  onMount(() => {
    ctx = el.getContext('2d');
    const resize = () => {
      const r = host.getBoundingClientRect();
      const dpr = window.devicePixelRatio || 1;
      el.width = Math.max(1, Math.round(r.width * dpr));
      el.height = Math.max(1, Math.round(r.height * dpr));
      el.style.width = `${r.width}px`;
      el.style.height = `${r.height}px`;
      canvas.size = { width: r.width, height: r.height };
      if (!canvas.fitted && r.width > 0) canvas.fit(bed);
      invalidate();
    };
    const observer = new ResizeObserver(resize);
    observer.observe(host);
    resize();
    const keydown = (e: KeyboardEvent) => {
      if (
        e.code === 'Space' &&
        !(e.target instanceof HTMLInputElement) &&
        !(e.target instanceof HTMLTextAreaElement)
      ) {
        if (!spaceHeld) spaceHeld = true;
        if (e.target === el || e.target === document.body) e.preventDefault();
      }
    };
    const keyup = (e: KeyboardEvent) => {
      if (e.code === 'Space') spaceHeld = false;
    };
    const theme = new MutationObserver(() => invalidate());
    theme.observe(document.documentElement, { attributes: true, attributeFilter: ['data-theme'] });
    const scheme = matchMedia('(prefers-color-scheme: light)');
    scheme.addEventListener('change', invalidate);
    window.addEventListener('keydown', keydown);
    window.addEventListener('keyup', keyup);
    return () => {
      observer.disconnect();
      theme.disconnect();
      scheme.removeEventListener('change', invalidate);
      window.removeEventListener('keydown', keydown);
      window.removeEventListener('keyup', keyup);
      cancelAnimationFrame(frame);
    };
  });

  $effect(() => {
    // Refit when the machine's bed size changes.
    void bed.width;
    void bed.height;
    canvas.fitted = false;
    if (canvas.size.width > 0) canvas.fit(bed);
  });

  $effect(() => {
    if (editor.project) images.prune(new Set(editor.project.objects.map((o) => o.id)));
  });

  /** Bed colour from the theme, for the in-place text editor's ink. */
  let bedColor = $state('#121417');

  const empty = $derived(designing && editor.project !== null && editor.project.objects.length === 0);
</script>

<div class="canvas-host" bind:this={host}>
  <canvas
    bind:this={el}
    tabindex="0"
    aria-label="Machine bed"
    style:cursor
    data-testid="bed-canvas"
    {onpointerdown}
    {onpointermove}
    {onpointerup}
    onpointercancel={onpointerup}
    onpointerleave={() => (canvas.cursor = null)}
    {onwheel}
    oncontextmenu={(e) => e.preventDefault()}
    {ondblclick}
  ></canvas>

  <TextEditOverlay {bed} {bedColor} />

  {#if empty}
    <p class="empty" data-testid="empty-hint">Import art with the Image tool, or drop files here</p>
  {/if}

  <div class="zoom" role="group" aria-label="Zoom">
    <button type="button" class="icon-btn" aria-label="Zoom out" onclick={() => canvas.zoomBy(1 / 1.25)}
      ><Minus size={16} /></button
    >
    <span class="pct mono" data-testid="zoom-percent">{canvas.percent}%</span>
    <button type="button" class="icon-btn" aria-label="Zoom in" onclick={() => canvas.zoomBy(1.25)}
      ><Plus size={16} /></button
    >
    <button type="button" class="btn ghost small" onclick={() => canvas.fit(bed)}
      ><Maximize size={14} />Fit bed</button
    >
  </div>
</div>

<style>
  .canvas-host {
    position: relative;
    flex-grow: 1;
    min-height: 0;
    overflow: hidden;
  }

  canvas {
    display: block;
    touch-action: none;
    outline: none;
  }

  .empty {
    position: absolute;
    left: 50%;
    top: 50%;
    transform: translate(-50%, -50%);
    margin: 0;
    color: var(--ol-text-dim);
    white-space: nowrap;
    pointer-events: none;
  }

  .zoom {
    position: absolute;
    right: 16px;
    bottom: 16px;
    display: flex;
    align-items: center;
    gap: 2px;
    padding: 4px;
    border-radius: var(--ol-radius-md);
    background: var(--ol-surface);
    border: 1px solid var(--ol-border);
  }

  .pct {
    font-size: var(--ol-fs-sm);
    font-weight: 500;
    padding: 0 6px;
    min-width: 48px;
    text-align: center;
  }
</style>
