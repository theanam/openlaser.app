<script lang="ts">
  import Link from '@lucide/svelte/icons/link';
  import Unlink from '@lucide/svelte/icons/unlink';
  import NumberField from '$lib/ui/NumberField.svelte';
  import { transformObjects } from '$lib/project/operations';
  import type { Mat2D } from '$lib/geometry/types';
  import {
    anchorOf,
    boundsOf,
    displayRotation,
    moveAnchorTo,
    resizeAbout,
    rotateAbout,
    selectedObjects,
  } from '../lib/selection';
  import { editor } from '../state/editor.svelte';
  import { profiles } from '../state/profiles.svelte';
  import AnchorPicker from './AnchorPicker.svelte';

  const objects = $derived(editor.project ? selectedObjects(editor.project, editor.selection) : []);
  const bounds = $derived(boundsOf(objects));
  const anchorPoint = $derived(bounds ? anchorOf(bounds, editor.anchor) : null);
  const rotation = $derived(displayRotation(objects));
  const canRotate = $derived(objects.length > 0 && objects.every((o) => o.kind !== 'image'));
  const has = $derived(bounds !== null && editor.view === 'design');

  function apply(matrix: Mat2D, live: boolean, key: string) {
    const ids = editor.selection;
    editor.commit((p) => transformObjects(p, ids, matrix), { coalesce: `field-${key}` });
    if (!live) editor.sealHistory();
  }
</script>

<div class="bar mono" data-testid="selection-bar">
  <AnchorPicker value={editor.anchor} onchange={(a) => (editor.anchor = a)} />
  <div class="fields" class:off={!has}>
    <NumberField
      compact
      label="X"
      decimals={3}
      step={0.1}
      value={anchorPoint?.x ?? 0}
      disabled={!has}
      testid="sel-x"
      onchange={(v, live) => bounds && apply(moveAnchorTo(bounds, editor.anchor, { x: v }), live, 'x')}
    />
    <NumberField
      compact
      label="Y"
      decimals={3}
      step={0.1}
      value={anchorPoint?.y ?? 0}
      disabled={!has}
      testid="sel-y"
      onchange={(v, live) => bounds && apply(moveAnchorTo(bounds, editor.anchor, { y: v }), live, 'y')}
    />
    <NumberField
      compact
      label="W"
      decimals={3}
      step={0.1}
      min={0.01}
      value={bounds ? bounds.maxX - bounds.minX : 0}
      disabled={!has}
      testid="sel-w"
      onchange={(v, live) =>
        bounds && apply(resizeAbout(bounds, editor.anchor, { width: v }, editor.keepAspect), live, 'w')}
    />
    <button
      type="button"
      class="icon-btn sm lock"
      aria-label={editor.keepAspect ? 'Keep aspect ratio: on' : 'Keep aspect ratio: off'}
      aria-pressed={editor.keepAspect}
      title="Keep aspect ratio"
      onclick={() => (editor.keepAspect = !editor.keepAspect)}
    >
      {#if editor.keepAspect}<Link size={14} />{:else}<Unlink size={14} />{/if}
    </button>
    <NumberField
      compact
      label="H"
      decimals={3}
      step={0.1}
      min={0.01}
      value={bounds ? bounds.maxY - bounds.minY : 0}
      disabled={!has}
      testid="sel-h"
      onchange={(v, live) =>
        bounds && apply(resizeAbout(bounds, editor.anchor, { height: v }, editor.keepAspect), live, 'h')}
    />
    <NumberField
      compact
      label="∠"
      unit="°"
      decimals={1}
      step={1}
      value={rotation}
      disabled={!has || !canRotate}
      testid="sel-angle"
      onchange={(v, live) => bounds && apply(rotateAbout(bounds, editor.anchor, v - rotation), live, 'r')}
    />
  </div>
  <span class="spacer"></span>
  <span class="machine"
    >{profiles.active.name} · {profiles.active.bedWidth} × {profiles.active.bedHeight} mm</span
  >
</div>

<style>
  .bar {
    height: var(--ol-selectionbar-h);
    flex-shrink: 0;
    display: flex;
    align-items: center;
    gap: 14px;
    padding: 0 16px;
    border-bottom: 1px solid var(--ol-border);
    font-size: var(--ol-fs-sm);
    overflow-x: auto;
    overflow-y: hidden;
  }

  .fields {
    display: flex;
    align-items: center;
    gap: 6px;
  }

  .fields.off {
    opacity: 0.5;
  }

  .fields :global(.nf) {
    flex-direction: row;
    align-items: center;
    gap: 6px;
    width: 134px;
  }

  .fields :global(.nf:last-child) {
    width: 104px;
  }

  .fields :global(.nf-label) {
    font-family: var(--ol-font-mono);
    color: var(--ol-text-muted);
    min-width: 10px;
  }

  .lock {
    margin: 0 -2px;
  }

  .spacer {
    flex-grow: 1;
  }

  .machine {
    color: var(--ol-text-muted);
    font-family: var(--ol-font);
    white-space: nowrap;
  }
</style>
