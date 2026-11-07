<script lang="ts">
  import TriangleAlert from '@lucide/svelte/icons/triangle-alert';
  import { bringOnBed, outsideBed } from 'libopenlaser/project';
  import { editor } from '../state/editor.svelte';
  import { currentBed } from '../state/work-area';
  import { zoomToSelection } from '../actions';

  /** Says when art reaches past the work area: it would burn off the material or not at all. */
  const outside = $derived(editor.project ? outsideBed(editor.project.objects, currentBed()) : []);

  function show() {
    editor.select(outside.map((o) => o.id));
    zoomToSelection();
  }

  function bringIn() {
    const ids = new Set(outside.map((o) => o.id));
    const bed = currentBed();
    editor.commit((p) => bringOnBed(p, ids, bed) ?? p);
    editor.sealHistory();
    editor.select([...ids]);
  }
</script>

{#if editor.view === 'design' && outside.length}
  <div class="bed-warning" role="status" data-testid="bed-warning">
    <TriangleAlert size={15} />
    <span>{outside.length === 1 ? '1 object is' : `${outside.length} objects are`} outside the work area</span
    >
    <button type="button" class="btn small" onclick={show} data-testid="bed-warning-show">Show</button>
    <button type="button" class="btn small" onclick={bringIn} data-testid="bed-warning-fit">Move in</button>
  </div>
{/if}

<style>
  .bed-warning {
    position: absolute;
    left: 50%;
    top: 12px;
    transform: translateX(-50%);
    display: flex;
    align-items: center;
    gap: 8px;
    padding: 6px 6px 6px 10px;
    border: 1px solid color-mix(in srgb, var(--ol-hold) 50%, transparent);
    border-radius: var(--ol-radius-md);
    background: color-mix(in srgb, var(--ol-hold) 14%, var(--ol-surface));
    color: var(--ol-text);
    font-size: var(--ol-fs-sm);
    white-space: nowrap;
    box-shadow: var(--ol-shadow-pop);
  }

  .bed-warning :global(svg) {
    color: var(--ol-hold);
    flex-shrink: 0;
  }
</style>
