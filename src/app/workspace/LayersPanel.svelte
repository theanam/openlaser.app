<script lang="ts">
  import { DropdownMenu } from 'bits-ui';
  import Eye from '@lucide/svelte/icons/eye';
  import EyeOff from '@lucide/svelte/icons/eye-off';
  import Zap from '@lucide/svelte/icons/zap';
  import ZapOff from '@lucide/svelte/icons/zap-off';
  import Plus from '@lucide/svelte/icons/plus';
  import Trash2 from '@lucide/svelte/icons/trash-2';
  import ArrowDownToLine from '@lucide/svelte/icons/arrow-down-to-line';
  import GripVertical from '@lucide/svelte/icons/grip-vertical';
  import {
    moveLayer,
    moveObjectsToNewLayer,
    removeLayer,
    setObjectsLayer,
    updateLayer,
  } from '$lib/project/operations';
  import { ui } from '../state/ui.svelte';
  import type { Layer, LayerMode } from '$lib/project/types';
  import { confirm } from '$lib/ui/confirm.svelte';
  import { editor } from '../state/editor.svelte';
  import { layerSummary } from '../lib/layers';
  import ColorSwatch from './ColorSwatch.svelte';
  import LayerSettings from './LayerSettings.svelte';

  const layers = $derived(editor.project?.layers ?? []);
  const selectedLayerIds = $derived(
    new Set(editor.project?.objects.filter((o) => editor.selection.has(o.id)).map((o) => o.layerId) ?? []),
  );

  let dragIndex = $state<number | null>(null);
  let dropIndex = $state<number | null>(null);
  let renaming = $state<string | null>(null);

  function patch(layer: Layer, change: Partial<Layer>) {
    editor.commit((p) => updateLayer(p, layer.id, change));
  }

  /** Layers are never empty, so a new layer always takes the selected objects with it. */
  function newLayerFromSelection(mode: LayerMode) {
    const ids = editor.selection;
    if (ids.size === 0) return;
    const layer = editor.makeLayer(mode);
    editor.commit((p) => moveObjectsToNewLayer(p, ids, layer));
    editor.activeLayerId = layer.id;
  }

  /** Clicking a layer selects everything on it, so you see what it burns. */
  function selectLayer(layer: Layer) {
    const ids =
      editor.project?.objects
        .filter((o) => o.layerId === layer.id && o.visible && !o.locked)
        .map((o) => o.id) ?? [];
    editor.select(ids);
    editor.activeLayerId = layer.id;
  }

  async function remove(layer: Layer) {
    const count = editor.project?.objects.filter((o) => o.layerId === layer.id).length ?? 0;
    if (count > 0) {
      const ok = await confirm({
        title: `Delete ${layer.name}?`,
        message: `${count} ${count === 1 ? 'object' : 'objects'} on this layer will be deleted too.`,
        confirmLabel: 'Delete',
        tone: 'danger',
      });
      if (!ok) return;
    }
    editor.commit((p) => removeLayer(p, layer.id));
  }

  function moveSelectionTo(layer: Layer) {
    const ids = editor.selection;
    editor.commit((p) => setObjectsLayer(p, ids, layer.id));
    editor.activeLayerId = layer.id;
  }

  function onkeydown(event: KeyboardEvent, index: number) {
    if (event.altKey && (event.key === 'ArrowUp' || event.key === 'ArrowDown')) {
      event.preventDefault();
      editor.commit((p) => moveLayer(p, index, index + (event.key === 'ArrowUp' ? -1 : 1)));
    }
  }

  function drop() {
    if (dragIndex !== null && dropIndex !== null && dragIndex !== dropIndex) {
      const from = dragIndex;
      const to = dropIndex > dragIndex ? dropIndex - 1 : dropIndex;
      editor.commit((p) => moveLayer(p, from, to));
    }
    dragIndex = null;
    dropIndex = null;
  }
</script>

<section class="layers" aria-label="Layers">
  <div class="head">
    <h2>Layers</h2>
    <span class="hint">Order = run order</span>
    <DropdownMenu.Root>
      <DropdownMenu.Trigger
        class="icon-btn sm"
        aria-label={editor.selection.size
          ? 'New layer from selection'
          : 'Select objects to put them on a new layer'}
        disabled={editor.selection.size === 0}
        data-testid="new-layer"><Plus size={16} /></DropdownMenu.Trigger
      >
      <DropdownMenu.Portal>
        <DropdownMenu.Content class="ol-menu" sideOffset={6} align="end">
          <DropdownMenu.Item class="ol-menu-item" onSelect={() => newLayerFromSelection('line')}
            >New line layer</DropdownMenu.Item
          >
          <DropdownMenu.Item class="ol-menu-item" onSelect={() => newLayerFromSelection('fill')}
            >New fill layer</DropdownMenu.Item
          >
          <DropdownMenu.Item class="ol-menu-item" onSelect={() => newLayerFromSelection('image')}
            >New image layer</DropdownMenu.Item
          >
        </DropdownMenu.Content>
      </DropdownMenu.Portal>
    </DropdownMenu.Root>
  </div>

  {#if layers.length === 0}
    <p class="empty">Import art or draw a shape to add a layer.</p>
  {:else}
    <ul
      class="rows"
      role="listbox"
      aria-label="Layers in run order"
      ondragover={(e) => e.preventDefault()}
      ondrop={drop}
    >
      {#each layers as layer, i (layer.id)}
        <li
          class="row"
          class:active={layer.id === editor.activeLayerId}
          class:drop-before={dropIndex === i && dragIndex !== null}
          class:muted-row={!layer.output}
          role="option"
          aria-selected={layer.id === editor.activeLayerId}
          tabindex="0"
          draggable="true"
          ondragstart={(e) => {
            dragIndex = i;
            e.dataTransfer?.setData('text/plain', layer.id);
          }}
          ondragover={(e) => {
            e.preventDefault();
            const r = (e.currentTarget as HTMLElement).getBoundingClientRect();
            dropIndex = e.clientY < r.top + r.height / 2 ? i : i + 1;
          }}
          ondragend={() => {
            dragIndex = null;
            dropIndex = null;
          }}
          onclick={() => selectLayer(layer)}
          onpointerenter={() => (ui.hoverLayerId = layer.id)}
          onpointerleave={() => ui.hoverLayerId === layer.id && (ui.hoverLayerId = null)}
          onkeydown={(e) => {
            if (e.key === 'Enter' || e.key === ' ') {
              if (e.target === e.currentTarget) {
                e.preventDefault();
                selectLayer(layer);
              }
            }
            onkeydown(e, i);
          }}
          data-testid="layer-row"
        >
          <span class="grip" aria-hidden="true"><GripVertical size={14} /></span>
          <ColorSwatch color={layer.color} label={layer.name} onchange={(color) => patch(layer, { color })} />
          <div class="text">
            {#if renaming === layer.id}
              <!-- svelte-ignore a11y_autofocus -->
              <input
                class="rename"
                value={layer.name}
                aria-label="Layer name"
                autofocus
                onclick={(e) => e.stopPropagation()}
                onblur={(e) => {
                  const v = e.currentTarget.value.trim();
                  renaming = null;
                  if (v && v !== layer.name) patch(layer, { name: v });
                }}
                onkeydown={(e) => {
                  e.stopPropagation();
                  if (e.key === 'Enter') e.currentTarget.blur();
                  if (e.key === 'Escape') renaming = null;
                }}
              />
            {:else}
              <span class="name" role="button" tabindex="-1" ondblclick={() => (renaming = layer.id)}
                >{layer.name}</span
              >
            {/if}
            <span class="summary mono">{layerSummary(layer)}</span>
          </div>
          {#if editor.selection.size > 0 && !(selectedLayerIds.size === 1 && selectedLayerIds.has(layer.id))}
            <button
              type="button"
              class="icon-btn sm move-here"
              aria-label="Move selection to {layer.name}"
              title="Move selection here"
              onclick={(e) => {
                e.stopPropagation();
                moveSelectionTo(layer);
              }}><ArrowDownToLine size={15} /></button
            >
          {/if}
          <button
            type="button"
            class="icon-btn sm"
            aria-label={layer.visible ? `Hide ${layer.name}` : `Show ${layer.name}`}
            title={layer.visible ? 'Hide' : 'Show'}
            onclick={(e) => {
              e.stopPropagation();
              patch(layer, { visible: !layer.visible });
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
              patch(layer, { output: !layer.output });
            }}
          >
            {#if layer.output}<Zap size={15} />{:else}<ZapOff size={15} />{/if}
          </button>
          <button
            type="button"
            class="icon-btn sm del"
            aria-label="Delete {layer.name}"
            title="Delete layer"
            onclick={(e) => {
              e.stopPropagation();
              void remove(layer);
            }}><Trash2 size={14} /></button
          >
        </li>
      {/each}
    </ul>
  {/if}

  {#if editor.activeLayer}
    <LayerSettings layer={editor.activeLayer} />
  {/if}
</section>

<style>
  .layers {
    padding: 16px;
    display: flex;
    flex-direction: column;
    gap: 12px;
    border-bottom: 1px solid var(--ol-border);
  }

  .head {
    display: flex;
    align-items: center;
    gap: 8px;
  }

  h2 {
    font-size: var(--ol-fs-md);
    font-weight: 600;
  }

  .hint {
    flex: 1;
    font-size: var(--ol-fs-sm);
    color: var(--ol-text-muted);
    text-align: right;
  }

  .empty {
    color: var(--ol-text-muted);
    font-size: var(--ol-fs-sm);
  }

  .rows {
    list-style: none;
    margin: 0;
    padding: 0;
    display: flex;
    flex-direction: column;
    gap: 4px;
  }

  .row {
    display: flex;
    align-items: center;
    gap: 8px;
    padding: 6px 6px 6px 2px;
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

  .muted-row .text {
    opacity: 0.55;
  }

  .grip {
    display: flex;
    color: var(--ol-text-dim);
    cursor: grab;
  }

  .text {
    flex: 1;
    display: flex;
    flex-direction: column;
    gap: 2px;
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

  .summary {
    font-size: var(--ol-fs-xs);
    color: var(--ol-text-muted);
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }

  .output.on {
    color: var(--ol-signal);
  }

  .del,
  .move-here {
    display: none;
  }

  .row:hover .del,
  .row:hover .move-here,
  .row.active .del,
  .del:focus-visible,
  .move-here:focus-visible {
    display: inline-flex;
  }
</style>
