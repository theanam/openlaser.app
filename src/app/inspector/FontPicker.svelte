<script lang="ts">
  import { Popover } from 'bits-ui';
  import Search from '@lucide/svelte/icons/search';
  import Check from '@lucide/svelte/icons/check';
  import ChevronDown from '@lucide/svelte/icons/chevron-down';
  import { onMount } from 'svelte';
  import {
    FONT_CATEGORIES,
    filterFonts,
    findFont,
    loadCatalog,
    type CatalogFont,
    type FontCategory,
    type FontCategoryId,
  } from '$lib/fonts/catalog';
  import { loadPreviewCss } from '$lib/fonts/loader';

  interface Props {
    value: string;
    /** Families used elsewhere in the project, for the "In this project" chip. */
    projectFonts?: string[];
    onpick: (font: CatalogFont) => void;
  }

  let { value, projectFonts = [], onpick }: Props = $props();

  const CATEGORY_LABEL: Record<FontCategory, string> = {
    sans: 'Sans',
    serif: 'Serif',
    display: 'Display',
    handwriting: 'Script',
    mono: 'Mono',
  };

  /** Rows are absolutely positioned; only those near the viewport render (1,800+ families). */
  const ROW = 38;
  const VIEW = 320;
  let open = $state(false);
  let fonts = $state.raw<CatalogFont[]>([]);
  let query = $state('');
  let category = $state<FontCategoryId>('all');
  let scrollTop = $state(0);
  let listEl = $state<HTMLDivElement | null>(null);

  onMount(() => {
    void loadCatalog().then((list) => (fonts = list));
  });

  const results = $derived(filterFonts(fonts, query, category, projectFonts));
  const first = $derived(Math.max(0, Math.floor(scrollTop / ROW) - 4));
  const last = $derived(Math.min(results.length, Math.ceil((scrollTop + VIEW) / ROW) + 4));
  const rows = $derived(results.slice(first, last));
  const current = $derived(findFont(fonts, value));

  // Previews load as their rows scroll into view.
  $effect(() => {
    for (const f of rows) loadPreviewCss(f);
  });

  function pick(font: CatalogFont) {
    open = false;
    onpick(font);
  }

  function onOpenChange(next: boolean) {
    open = next;
    if (next) {
      query = '';
      category = 'all';
      // Scroll the current family into view once the list has rendered.
      requestAnimationFrame(() => {
        const index = results.findIndex((f) => f.family === value);
        if (listEl && index >= 0) listEl.scrollTop = Math.max(0, index * ROW - VIEW / 2 + ROW / 2);
      });
    }
  }
</script>

<Popover.Root {open} {onOpenChange}>
  <Popover.Trigger class="font-trigger" aria-label="Font: {value}" data-testid="font-picker">
    <span class="font-name" style="font-family: '{value}', var(--ol-font)">{value}</span>
    <span class="cat mono">{current ? CATEGORY_LABEL[current.category] : ''}</span>
    <ChevronDown size={14} />
  </Popover.Trigger>
  <Popover.Portal>
    <Popover.Content class="ol-menu font-pop" sideOffset={6} align="start">
      <label class="search">
        <Search size={14} />
        <!-- svelte-ignore a11y_autofocus -->
        <input
          autofocus
          placeholder={fonts.length > 10
            ? `Search ${fonts.length.toLocaleString('en-US')} fonts`
            : 'Search fonts'}
          aria-label="Search fonts"
          bind:value={query}
          oninput={() => listEl && (listEl.scrollTop = 0)}
          onkeydown={(e) => {
            if (e.key !== 'Enter' || !results[0]) return;
            // Stop the same Enter from activating the trigger button that regains focus.
            e.preventDefault();
            pick(results[0]);
          }}
          data-testid="font-search"
        />
      </label>
      <div class="chips" role="group" aria-label="Font category">
        {#each FONT_CATEGORIES as c (c.id)}
          <button
            type="button"
            class="chip"
            aria-pressed={category === c.id}
            onclick={() => (category = c.id)}>{c.label}</button
          >
        {/each}
      </div>
      <div
        class="list"
        bind:this={listEl}
        style="height: {VIEW}px"
        onscroll={(e) => (scrollTop = e.currentTarget.scrollTop)}
        role="listbox"
        aria-label="Fonts"
      >
        {#if results.length}
          <div style="height: {results.length * ROW}px; position: relative">
            {#each rows as f, i (f.family)}
              <button
                type="button"
                role="option"
                aria-selected={f.family === value}
                class="row"
                style="top: {(first + i) * ROW}px"
                onclick={() => pick(f)}
              >
                <span class="preview" style="font-family: '{f.family}', var(--ol-font)">{f.family}</span>
                <span class="meta"
                  >{#if f.family === value}<Check size={14} />{:else}{CATEGORY_LABEL[f.category]}{/if}</span
                >
              </button>
            {/each}
          </div>
        {:else}
          <p class="none">No fonts match.</p>
        {/if}
      </div>
    </Popover.Content>
  </Popover.Portal>
</Popover.Root>

<style>
  :global(.font-trigger) {
    width: 100%;
    height: var(--ol-control-h);
    display: flex;
    align-items: center;
    gap: 8px;
    padding: 0 10px;
    border-radius: 8px;
    border: 1px solid var(--ol-border);
    background: var(--ol-bg);
    color: var(--ol-text);
    text-align: left;
  }

  .font-name {
    flex: 1;
    min-width: 0;
    font-size: 15px;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .cat {
    font-size: var(--ol-fs-xs);
    color: var(--ol-text-dim);
  }

  :global(.font-pop) {
    width: 340px;
    display: flex;
    flex-direction: column;
    gap: 6px;
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
    color: var(--ol-text);
    font-size: var(--ol-fs-sm);
  }

  .chips {
    display: flex;
    gap: 2px;
    padding: 3px;
    border-radius: var(--ol-radius-md);
    background: var(--ol-bg);
    overflow-x: auto;
    scrollbar-width: none;
  }

  .chip {
    flex-shrink: 0;
    height: 24px;
    padding: 0 8px;
    border: 0;
    border-radius: var(--ol-radius-sm);
    background: transparent;
    color: var(--ol-text-muted);
    font-size: var(--ol-fs-sm);
  }

  .chip[aria-pressed='true'] {
    background: var(--ol-border);
    color: var(--ol-text);
  }

  .list {
    overflow-y: auto;
    position: relative;
  }

  .row {
    position: absolute;
    left: 0;
    right: 0;
    height: 38px;
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 8px;
    padding: 0 10px;
    border: 0;
    border-radius: var(--ol-radius-sm);
    background: transparent;
    text-align: left;
  }

  .row:hover {
    background: var(--ol-surface-2);
  }

  .row[aria-selected='true'] {
    background: var(--ol-signal-tint);
  }

  .preview {
    font-size: 17px;
    line-height: 1;
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }

  .meta {
    flex-shrink: 0;
    display: flex;
    font-size: var(--ol-fs-xs);
    color: var(--ol-text-dim);
  }

  .row[aria-selected='true'] .meta {
    color: var(--ol-signal);
  }

  .none {
    padding: 12px 8px;
    color: var(--ol-text-muted);
  }
</style>
