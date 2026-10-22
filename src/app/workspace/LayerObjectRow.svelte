<script lang="ts">
  import Eye from '@lucide/svelte/icons/eye';
  import EyeOff from '@lucide/svelte/icons/eye-off';
  import Image from '@lucide/svelte/icons/image';
  import VectorSquare from '@lucide/svelte/icons/vector-square';
  import TriangleAlert from '@lucide/svelte/icons/triangle-alert';
  import Type from '@lucide/svelte/icons/type';
  import { layerAccepts } from '$lib/project/layer-fit';
  import { updateObject } from '$lib/project/operations';
  import type { Layer, SceneObject } from '$lib/project/types';
  import { editor } from '../state/editor.svelte';
  import { ui } from '../state/ui.svelte';
  import type { LayerDragState } from './layer-drag.svelte';

  let { object, layer, drag }: { object: SceneObject; layer: Layer; drag: LayerDragState } = $props();

  const selected = $derived(editor.selection.has(object.id));
  const fits = $derived(layerAccepts(layer.mode, object.kind));
  const Icon = $derived(object.kind === 'image' ? Image : object.kind === 'text' ? Type : VectorSquare);

  function select(e: MouseEvent | KeyboardEvent) {
    editor.select([object.id], e.shiftKey || e.metaKey || e.ctrlKey ? 'toggle' : 'replace');
  }
</script>

<li
  class="obj"
  class:selected
  class:hidden={!object.visible}
  role="treeitem"
  aria-selected={selected}
  tabindex="0"
  draggable="true"
  ondragstart={(e) => {
    e.stopPropagation();
    drag.startObjects(selected ? [...editor.selection] : [object.id]);
    e.dataTransfer?.setData('text/plain', object.id);
  }}
  ondragend={() => drag.reset()}
  onclick={(e) => {
    e.stopPropagation();
    select(e);
  }}
  onkeydown={(e) => {
    if (e.target !== e.currentTarget || (e.key !== 'Enter' && e.key !== ' ')) return;
    e.preventDefault();
    e.stopPropagation();
    select(e);
  }}
  onpointerenter={() => (ui.hoverObjectId = object.id)}
  onpointerleave={() => ui.hoverObjectId === object.id && (ui.hoverObjectId = null)}
  data-testid="object-row"
>
  <span class="kind" aria-hidden="true"><Icon size={15} /></span>
  <span class="name">{object.name}</span>
  {#if !fits}
    <span
      class="warn"
      role="img"
      aria-label={object.kind === 'image' ? 'Skipped: needs an image layer' : 'Skipped: needs a line or fill layer'}
      title={object.kind === 'image' ? 'Skipped: needs an image layer' : 'Skipped: needs a line or fill layer'}
      ><TriangleAlert size={13} /></span
    >
  {/if}
  <button
    type="button"
    class="icon-btn sm eye"
    aria-label={object.visible ? `Hide ${object.name}` : `Show ${object.name}`}
    title={object.visible ? 'Hide' : 'Show'}
    onclick={(e) => {
      e.stopPropagation();
      const id = object.id;
      const visible = !object.visible;
      editor.commit((p) => updateObject(p, id, { visible }));
    }}
  >
    {#if object.visible}<Eye size={14} />{:else}<EyeOff size={14} />{/if}
  </button>
</li>

<style>
  /* Reads as an item on its own: a card on the ground colour, a stronger edge on hover. */
  .obj {
    display: flex;
    align-items: center;
    gap: 8px;
    min-height: 32px;
    padding: 0 4px 0 10px;
    border-radius: var(--ol-radius-sm);
    border: 1px solid var(--ol-border);
    background: var(--ol-bg);
    font-size: var(--ol-fs-md);
    cursor: pointer;
  }

  .obj:hover {
    border-color: var(--ol-border-strong);
  }

  .obj.selected {
    border-color: var(--ol-beam);
  }

  .obj.hidden .name,
  .obj.hidden .kind {
    opacity: 0.5;
  }

  .kind {
    display: flex;
    color: var(--ol-text-2);
  }

  .name {
    flex: 1;
    min-width: 0;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .warn {
    display: flex;
    color: var(--ol-hold);
  }

  /* Keeps its space so the row never reflows under the pointer. */
  .eye {
    visibility: hidden;
  }

  .obj:hover .eye,
  .obj.hidden .eye,
  .eye:focus-visible {
    visibility: visible;
  }
</style>
