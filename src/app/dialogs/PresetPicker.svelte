<script lang="ts">
  import Search from '@lucide/svelte/icons/search';
  import Check from '@lucide/svelte/icons/check';
  import {
    groupByBrand,
    presetName,
    searchPresets,
    type MachinePreset,
    machineKind,
  } from '$lib/project/machine-presets';

  interface Props {
    /** Name of the highlighted preset. */
    selected?: string | null;
    onselect: (preset: MachinePreset) => void;
    height?: number;
  }

  let { selected = null, onselect, height = 240 }: Props = $props();
  let query = $state('');
  const groups = $derived(groupByBrand(searchPresets(query)));
</script>

<div class="picker">
  <label class="search">
    <Search size={14} />
    <input
      class="mono"
      placeholder="Search brand or model"
      aria-label="Search machines"
      bind:value={query}
      data-testid="preset-search"
    />
  </label>
  <div class="list" style="max-height: {height}px" role="radiogroup" aria-label="Machine">
    {#each groups as group (group.brand)}
      <div class="brand">{group.brand}</div>
      {#each group.presets as p (presetName(p))}
        {@const name = presetName(p)}
        <button
          type="button"
          role="radio"
          aria-checked={selected === name}
          class="item"
          onclick={() => onselect(p)}
        >
          <span
            >{p.model}{#if machineKind(p)}<span class="kind">{machineKind(p)}</span>{/if}</span
          >
          <span class="mono dim">{p.bedWidth} × {p.bedHeight}</span>
          <span class="tick"
            >{#if selected === name}<Check size={14} />{/if}</span
          >
        </button>
      {/each}
    {:else}
      <p class="none muted">No match. Pick a Generic size and edit it.</p>
    {/each}
  </div>
</div>

<style>
  .kind {
    margin-left: 8px;
    font-size: var(--ol-fs-xs);
    color: var(--ol-signal-text);
  }

  .picker {
    display: flex;
    flex-direction: column;
    gap: 8px;
    min-height: 0;
  }

  .search {
    display: flex;
    align-items: center;
    gap: 8px;
    height: 34px;
    padding: 0 10px;
    border-radius: var(--ol-radius-md);
    border: 1px solid var(--ol-border);
    background: var(--ol-bg);
    color: var(--ol-text-muted);
  }

  .search:focus-within {
    outline: 2px solid var(--ol-beam);
    outline-offset: 1px;
  }

  .search input {
    flex: 1;
    border: 0;
    background: none;
    outline: none;
    font-size: var(--ol-fs-sm);
    color: var(--ol-text);
  }

  .list {
    overflow-y: auto;
    display: flex;
    flex-direction: column;
    gap: 2px;
  }

  .brand {
    position: sticky;
    top: 0;
    padding: 6px 4px 2px;
    font-size: var(--ol-fs-xs);
    font-weight: 600;
    text-transform: uppercase;
    letter-spacing: 0.05em;
    color: var(--ol-text-dim);
    background: var(--ol-surface);
  }

  .item {
    display: grid;
    grid-template-columns: 1fr auto 16px;
    align-items: center;
    gap: 10px;
    padding: 7px 10px;
    border-radius: var(--ol-radius-sm);
    border: 1px solid transparent;
    background: none;
    text-align: left;
  }

  .item:hover {
    background: var(--ol-surface-2);
  }

  .item[aria-checked='true'] {
    border-color: var(--ol-signal);
    background: var(--ol-signal-tint);
  }

  .tick {
    display: flex;
    color: var(--ol-signal);
  }

  .none {
    padding: 8px 4px;
    font-size: var(--ol-fs-sm);
  }
</style>
