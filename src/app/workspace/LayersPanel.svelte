<script lang="ts">
  import { DropdownMenu } from 'bits-ui';
  import Plus from '@lucide/svelte/icons/plus';
  import { moveLayer, removeLayer, setObjectsLayer } from '$lib/project/operations';
  import type { Id, Layer, LayerMode } from '$lib/project/types';
  import { editor } from '../state/editor.svelte';
  import DeleteLayerDialog from './DeleteLayerDialog.svelte';
  import { LayerDragState } from './layer-drag.svelte';
  import LayerRow from './LayerRow.svelte';
  import LayerSettings from './LayerSettings.svelte';

  const layers = $derived(editor.project?.layers ?? []);
  const drag = new LayerDragState();
  /** Layer waiting in the delete dialog, which asks where its objects go. */
  let deleting = $state<Layer | null>(null);

  /** Deleting an empty layer needs no questions; otherwise the dialog picks a home for its objects. */
  function remove(layer: Layer) {
    const count = editor.project?.objects.filter((o) => o.layerId === layer.id).length ?? 0;
    if (count === 0) editor.commit((p) => removeLayer(p, layer.id));
    else deleting = layer;
  }

  function moveObjects(ids: ReadonlySet<Id>, layerId: Id) {
    const moving = editor.project?.objects.some((o) => ids.has(o.id) && o.layerId !== layerId);
    if (moving) editor.commit((p) => setObjectsLayer(p, ids, layerId));
    editor.activeLayerId = layerId;
  }

  function drop() {
    const d = drag.drag;
    if (d?.kind === 'layer' && drag.dropIndex !== null && drag.dropIndex !== d.index) {
      const to = drag.dropIndex > d.index ? drag.dropIndex - 1 : drag.dropIndex;
      editor.commit((p) => moveLayer(p, d.index, to));
    } else if (d?.kind === 'object' && drag.dropLayerId) {
      moveObjects(new Set(d.ids), drag.dropLayerId);
    }
    drag.reset();
  }

  function onkeydown(event: KeyboardEvent) {
    if (!event.altKey || (event.key !== 'ArrowUp' && event.key !== 'ArrowDown')) return;
    const row = (event.target as HTMLElement).closest('[data-testid="layer-row"]');
    const index = row ? [...row.parentElement!.children].indexOf(row) : -1;
    if (index < 0) return;
    event.preventDefault();
    editor.commit((p) => moveLayer(p, index, index + (event.key === 'ArrowUp' ? -1 : 1)));
  }

  const MODES: Array<{ mode: LayerMode; label: string }> = [
    { mode: 'line', label: 'Line layer' },
    { mode: 'fill', label: 'Fill layer' },
    { mode: 'image', label: 'Image layer' },
  ];
</script>

<section class="layers" aria-label="Layers">
  <div class="head">
    <h2>Layers</h2>
    <span class="hint">Order = run order</span>
    <DropdownMenu.Root>
      <DropdownMenu.Trigger class="icon-btn sm" aria-label="Add layer" title="Add layer" data-testid="new-layer"
        ><Plus size={16} /></DropdownMenu.Trigger
      >
      <DropdownMenu.Portal>
        <DropdownMenu.Content class="ol-menu" sideOffset={6} align="end">
          {#each MODES as { mode, label } (mode)}
            <DropdownMenu.Item class="ol-menu-item" onSelect={() => editor.addLayer(mode)}>{label}</DropdownMenu.Item>
          {/each}
        </DropdownMenu.Content>
      </DropdownMenu.Portal>
    </DropdownMenu.Root>
  </div>

  {#if layers.length === 0}
    <p class="empty">Draw, import, or press + to add a layer.</p>
  {:else}
    <ul
      class="rows"
      role="tree"
      aria-label="Layers in run order"
      ondragover={(e) => e.preventDefault()}
      ondrop={drop}
      {onkeydown}
    >
      {#each layers as layer, i (layer.id)}
        <LayerRow {layer} index={i} {drag} ondelete={remove} onmoveselection={(l) => moveObjects(editor.selection, l.id)} />
      {/each}
    </ul>
  {/if}

  {#if editor.activeLayer}
    <LayerSettings layer={editor.activeLayer} />
  {/if}
</section>

{#if deleting}
  {#key deleting.id}
    <DeleteLayerDialog layer={deleting} onclose={() => (deleting = null)} />
  {/key}
{/if}

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
</style>
