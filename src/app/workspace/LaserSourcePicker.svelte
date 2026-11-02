<script lang="ts">
  import { laserSources, layerSource } from '$lib/project/accessories';
  import type { Id, Layer } from '$lib/project/types';
  import { profiles } from '../state/profiles.svelte';

  /** On machines with more than one laser, which one burns this layer. */
  let { layer, onchange }: { layer: Layer; onchange: (id: Id) => void } = $props();

  const sources = $derived(laserSources(profiles.active));
  const current = $derived(layerSource(profiles.active, layer));
</script>

{#if sources.length > 1}
  <div class="field">
    <span class="label">Laser</span>
    <div class="segmented" role="group" aria-label="Laser" data-testid="layer-laser">
      {#each sources as source (source.id)}
        <button
          type="button"
          aria-pressed={current?.id === source.id}
          title="{source.wavelength} nm"
          onclick={() => onchange(source.id)}>{source.label}</button
        >
      {/each}
    </div>
  </div>
{/if}

<style>
  .field {
    display: flex;
    flex-direction: column;
    gap: 6px;
  }

  .label {
    font-size: var(--ol-fs-xs);
    color: var(--ol-text-muted);
  }
</style>
