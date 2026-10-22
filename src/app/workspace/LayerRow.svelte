<script lang="ts">
  import Eye from '@lucide/svelte/icons/eye';
  import EyeOff from '@lucide/svelte/icons/eye-off';
  import Zap from '@lucide/svelte/icons/zap';
  import ZapOff from '@lucide/svelte/icons/zap-off';
  import Trash2 from '@lucide/svelte/icons/trash-2';
  import ArrowDownToLine from '@lucide/svelte/icons/arrow-down-to-line';
  import ChevronRight from '@lucide/svelte/icons/chevron-right';
  import GripVertical from '@lucide/svelte/icons/grip-vertical';
  import { updateLayer } from '$lib/project/operations';
  import type { Layer } from '$lib/project/types';
  import { editor } from '../state/editor.svelte';
  import { ui } from '../state/ui.svelte';
  import { layerSummary } from '../lib/layers';
  import { profiles } from '../state/profiles.svelte';
  import ColorSwatch from './ColorSwatch.svelte';
  import LayerObjectRow from './LayerObjectRow.svelte';
  import type { LayerDragState } from './layer-drag.svelte';

  interface Props {
    layer: Layer;
    index: number;
    drag: LayerDragState;
    ondelete: (layer: Layer) => void;
    onmoveselection: (layer: Layer) => void;
  }

  let { layer, index, drag, ondelete, onmoveselection }: Props = $props();

  let renaming = $state(false);
  let expanded = $state(true);

  const objects = $derived(editor.project?.objects.filter((o) => o.layerId === layer.id) ?? []);
  const selectedHere = $derived(objects.filter((o) => editor.selection.has(o.id)).length);
  /** Offer "Move selection here" unless the whole selection is already on this layer. */
  const canTakeSelection = $derived(editor.selection.size > 0 && selectedHere < editor.selection.size);
  const active = $derived(layer.id === editor.activeLayerId);
  const dropTarget = $derived(drag.drag?.kind === 'object' && drag.dropLayerId === layer.id);

  function patch(change: Partial<Layer>) {
    const id = layer.id;
    editor.commit((p) => updateLayer(p, id, change));
  }

  /** Clicking a layer selects everything on it, so you see what it burns. */
  function selectLayer() {
    editor.select(objects.filter((o) => o.visible && !o.locked).map((o) => o.id));
    editor.activeLayerId = layer.id;
  }
</script>

<li
  class="row"
  class:active
  class:drop-before={drag.dropIndex === index && drag.drag?.kind === 'layer'}
  class:drop-target={dropTarget}
  class:muted-row={!layer.output}
  role="treeitem"
  aria-selected={active}
  aria-expanded={expanded}
  tabindex="0"
  draggable="true"
  ondragstart={(e) => {
    drag.startLayer(index);
    e.dataTransfer?.setData('text/plain', layer.id);
  }}
  ondragover={(e) => {
    e.preventDefault();
    const r = (e.currentTarget as HTMLElement).getBoundingClientRect();
    drag.over(index, layer.id, e.clientY < r.top + r.height / 2);
  }}
  ondragend={() => drag.reset()}
  onclick={selectLayer}
  onpointerenter={() => (ui.hoverLayerId = layer.id)}
  onpointerleave={() => ui.hoverLayerId === layer.id && (ui.hoverLayerId = null)}
  onkeydown={(e) => {
    if (e.target !== e.currentTarget) return;
    if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault();
      selectLayer();
    } else if (e.key === 'ArrowRight' || e.key === 'ArrowLeft') {
      e.preventDefault();
      expanded = e.key === 'ArrowRight';
    }
  }}
  data-testid="layer-row"
>
  <div class="head">
    <span class="grip" aria-hidden="true"><GripVertical size={14} /></span>
    <button
      type="button"
      class="icon-btn sm chevron"
      class:open={expanded}
      aria-label={expanded ? `Collapse ${layer.name}` : `Expand ${layer.name}`}
      onclick={(e) => {
        e.stopPropagation();
        expanded = !expanded;
      }}><ChevronRight size={14} /></button
    >
    <ColorSwatch color={layer.color} label={layer.name} onchange={(color) => patch({ color })} />
    <div class="text">
      {#if renaming}
        <!-- svelte-ignore a11y_autofocus -->
        <input
          class="rename"
          value={layer.name}
          aria-label="Layer name"
          autofocus
          onclick={(e) => e.stopPropagation()}
          onblur={(e) => {
            const v = e.currentTarget.value.trim();
            renaming = false;
            if (v && v !== layer.name) patch({ name: v });
          }}
          onkeydown={(e) => {
            e.stopPropagation();
            if (e.key === 'Enter') e.currentTarget.blur();
            if (e.key === 'Escape') renaming = false;
          }}
        />
      {:else}
        <span class="name" role="button" tabindex="-1" ondblclick={() => (renaming = true)}
          >{layer.name}</span
        >
      {/if}
    </div>
    <button
      type="button"
      class="icon-btn sm action"
      class:idle={!canTakeSelection}
      aria-label="Move selection to {layer.name}"
      title="Move selection here"
      aria-hidden={!canTakeSelection}
      tabindex={canTakeSelection ? 0 : -1}
      onclick={(e) => {
        e.stopPropagation();
        onmoveselection(layer);
      }}><ArrowDownToLine size={15} /></button
    >
    <button
      type="button"
      class="icon-btn sm"
      aria-label={layer.visible ? `Hide ${layer.name}` : `Show ${layer.name}`}
      title={layer.visible ? 'Hide' : 'Show'}
      onclick={(e) => {
        e.stopPropagation();
        patch({ visible: !layer.visible });
      }}
    >
      {#if layer.visible}<Eye size={15} />{:else}<EyeOff size={15} />{/if}
    </button>
    <button
      type="button"
      class="icon-btn sm output"
      class:on={layer.output}
      aria-label={layer.output ? `${layer.name} outputs to job` : `${layer.name} skipped in job`}
      aria-pressed={layer.output}
      title={layer.output ? 'Outputs to job' : 'Skipped in job'}
      onclick={(e) => {
        e.stopPropagation();
        patch({ output: !layer.output });
      }}
    >
      {#if layer.output}<Zap size={15} />{:else}<ZapOff size={15} />{/if}
    </button>
    <button
      type="button"
      class="icon-btn sm action"
      aria-label="Delete {layer.name}"
      title="Delete layer"
      onclick={(e) => {
        e.stopPropagation();
        ondelete(layer);
      }}><Trash2 size={14} /></button
    >
  </div>
  <span class="summary mono">{layerSummary(layer, profiles.active.speedUnit)}</span>
  {#if expanded}
    <ul class="objects" role="group" aria-label="Objects on {layer.name}">
      {#each objects as object (object.id)}
        <LayerObjectRow {object} {layer} {drag} />
      {:else}
        <li class="none" role="none">Drag objects here</li>
      {/each}
    </ul>
  {/if}
</li>

<style>
  .row {
    display: flex;
    flex-direction: column;
    padding: 4px 6px 4px 2px;
    border-radius: var(--ol-radius-md);
    border: 1px solid transparent;
    cursor: pointer;
  }

  .row:hover {
    background: var(--ol-surface-2);
  }

  .row.active {
    background: var(--ol-surface-2);
    border-color: var(--ol-border-strong);
  }

  .row.drop-before {
    box-shadow: 0 -2px 0 var(--ol-beam);
  }

  .row.drop-target {
    border-color: var(--ol-beam);
  }

  .head {
    display: flex;
    align-items: center;
    gap: 6px;
    min-height: 30px;
  }

  .muted-row .text,
  .muted-row .summary {
    opacity: 0.55;
  }

  .grip {
    display: flex;
    color: var(--ol-text-dim);
    cursor: grab;
  }

  .chevron {
    color: var(--ol-text-dim);
    transition: transform 120ms;
  }

  .chevron.open {
    transform: rotate(90deg);
  }

  .text {
    flex: 1;
    display: flex;
    min-width: 0;
  }

  .name {
    font-weight: 500;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .rename {
    height: 22px;
    padding: 0 4px;
    border-radius: 4px;
    border: 1px solid var(--ol-beam);
    background: var(--ol-bg);
    font-weight: 500;
  }

  /* Under the name, aligned with it: grip, chevron and swatch with their gaps. */
  .summary {
    padding: 0 0 2px 74px;
    font-size: var(--ol-fs-xs);
    color: var(--ol-text-muted);
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }

  .output.on {
    color: var(--ol-signal);
  }

  /* Hover-only actions keep their space, so rows never reflow under the pointer. */
  .action {
    visibility: hidden;
  }

  .row:hover .action:not(.idle),
  .row.active .action:not(.idle),
  .action:focus-visible {
    visibility: visible;
  }

  .objects {
    list-style: none;
    margin: 4px 0 2px;
    padding: 0 0 0 36px;
    display: flex;
    flex-direction: column;
    gap: 4px;
  }

  .none {
    min-height: 32px;
    display: flex;
    align-items: center;
    padding: 0 10px;
    border-radius: var(--ol-radius-sm);
    border: 1px dashed var(--ol-border);
    font-size: var(--ol-fs-sm);
    color: var(--ol-text-dim);
  }
</style>
