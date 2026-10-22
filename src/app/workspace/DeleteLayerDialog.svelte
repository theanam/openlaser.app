<script lang="ts">
  import Dialog from '$lib/ui/Dialog.svelte';
  import { deleteDestinations } from '$lib/project/layer-fit';
  import { removeLayer } from '$lib/project/operations';
  import type { Id, Layer } from '$lib/project/types';
  import { editor } from '../state/editor.svelte';
  import { layerSummary } from '../lib/layers';
  import { profiles } from '../state/profiles.svelte';

  let { layer, onclose }: { layer: Layer; onclose: () => void } = $props();

  let open = $state(true);
  const count = $derived(editor.project?.objects.filter((o) => o.layerId === layer.id).length ?? 0);
  const destinations = $derived(editor.project ? deleteDestinations(editor.project, layer.id) : []);
  let destination = $state<Id | null>(null);
  const target = $derived(destination ?? destinations[0]?.id ?? null);

  function confirm() {
    const id = layer.id;
    const moveTo = target;
    editor.commit((p) => removeLayer(p, id, moveTo));
    if (moveTo) editor.activeLayerId = moveTo;
    open = false;
    onclose();
  }
</script>

<Dialog bind:open title="Delete {layer.name}?" width={380} {onclose} testid="delete-layer-dialog">
  {#if destinations.length > 0}
    <p class="lead">Move its {count} {count === 1 ? 'object' : 'objects'} to</p>
    <div class="choices" role="radiogroup" aria-label="Destination layer">
      {#each destinations as option (option.id)}
        <button
          type="button"
          role="radio"
          class="choice"
          aria-checked={option.id === target}
          onclick={() => (destination = option.id)}
          data-testid="delete-layer-destination"
        >
          <span class="dot" style="background: {option.color}"></span>
          <span class="name">{option.name}</span>
          <span class="summary mono">{layerSummary(option, profiles.active.speedUnit)}</span>
        </button>
      {/each}
    </div>
  {:else}
    <p class="lead">
      {count === 1 ? 'The object' : `The ${count} objects`} on it will be deleted too. No other layer
      can take {count === 1 ? 'it' : 'them'}.
    </p>
  {/if}
  {#snippet footer()}
    <button type="button" class="btn" onclick={() => (open = false)}>Cancel</button>
    <button type="button" class="btn signal" onclick={confirm} data-testid="delete-layer-confirm">Delete</button>
  {/snippet}
</Dialog>

<style>
  .lead {
    color: var(--ol-text-2);
    line-height: 1.55;
    margin: 0 0 10px;
  }

  .choices {
    display: flex;
    flex-direction: column;
    gap: 4px;
  }

  .choice {
    display: flex;
    align-items: center;
    gap: 10px;
    padding: 8px 10px;
    border-radius: var(--ol-radius-md);
    border: 1px solid var(--ol-border);
    background: var(--ol-surface);
    color: var(--ol-text);
    text-align: left;
    cursor: pointer;
  }

  .choice:hover {
    background: var(--ol-surface-2);
  }

  .choice[aria-checked='true'] {
    border-color: var(--ol-beam);
    background: var(--ol-surface-2);
  }

  .dot {
    width: 12px;
    height: 12px;
    border-radius: 3px;
    flex: none;
  }

  .name {
    font-weight: 500;
    flex: 1;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .summary {
    font-size: var(--ol-fs-xs);
    color: var(--ol-text-muted);
    white-space: nowrap;
  }
</style>
