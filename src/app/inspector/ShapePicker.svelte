<script lang="ts">
  import Search from '@lucide/svelte/icons/search';
  import { SHAPES, SHAPE_GROUPS, type ShapeKind } from '$lib/shapes';
  import ShapeGlyph from './ShapeGlyph.svelte';

  let { value, onpick }: { value: string; onpick: (kind: ShapeKind) => void } = $props();
  let query = $state('');

  const groups = $derived(
    SHAPE_GROUPS.map((group) => ({
      group,
      items: SHAPES.filter(
        (s) =>
          s.group === group && (!query.trim() || s.label.toLowerCase().includes(query.trim().toLowerCase())),
      ),
    })).filter((g) => g.items.length),
  );
</script>

<div class="shape-picker">
  <label class="search">
    <Search size={14} />
    <!-- svelte-ignore a11y_autofocus -->
    <input
      autofocus
      placeholder="Search {SHAPES.length} shapes"
      aria-label="Search shapes"
      bind:value={query}
      onkeydown={(e) => {
        if (e.key !== 'Enter' || !groups[0]) return;
        // Stop the same Enter from activating the trigger button that regains focus.
        e.preventDefault();
        onpick(groups[0].items[0].kind);
      }}
      data-testid="shape-search"
    />
  </label>
  <div class="scroll" role="listbox" aria-label="Shapes">
    {#each groups as g (g.group)}
      <div class="group">{g.group}</div>
      <div class="grid">
        {#each g.items as s (s.kind)}
          <button
            type="button"
            role="option"
            aria-selected={s.kind === value}
            class="item"
            onclick={() => onpick(s.kind)}
            data-shape={s.kind}
          >
            <ShapeGlyph kind={s.kind} size={24} />
            <span>{s.label}</span>
          </button>
        {/each}
      </div>
    {:else}
      <p class="none">No shapes match.</p>
    {/each}
  </div>
</div>

<style>
  .shape-picker {
    width: 300px;
    display: flex;
    flex-direction: column;
    gap: 8px;
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

  .search input {
    flex: 1;
    border: 0;
    background: none;
    outline: none;
    color: var(--ol-text);
    font-size: var(--ol-fs-sm);
  }

  .scroll {
    max-height: 380px;
    overflow-y: auto;
  }

  .group {
    padding: 8px 4px 4px;
    font-size: var(--ol-fs-xs);
    font-weight: 600;
    text-transform: uppercase;
    letter-spacing: 0.05em;
    color: var(--ol-text-dim);
  }

  .grid {
    display: grid;
    grid-template-columns: repeat(4, 1fr);
    gap: 4px;
  }

  .item {
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 4px;
    padding: 8px 2px 6px;
    border-radius: var(--ol-radius-sm);
    border: 1px solid transparent;
    background: none;
    color: var(--ol-text-2);
    font-size: 10.5px;
    line-height: 1.2;
    text-align: center;
  }

  .item:hover {
    background: var(--ol-surface-2);
    color: var(--ol-text);
  }

  .item[aria-selected='true'] {
    border-color: var(--ol-signal);
    background: var(--ol-signal-tint);
    color: var(--ol-text);
  }

  .none {
    padding: 12px 4px;
    color: var(--ol-text-muted);
  }
</style>
