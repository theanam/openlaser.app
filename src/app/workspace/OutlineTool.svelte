<script lang="ts">
  import { Popover } from 'bits-ui';
  import SquircleDashed from '@lucide/svelte/icons/squircle-dashed';
  import NumberField from '$lib/ui/NumberField.svelte';
  import Toggle from '$lib/ui/Toggle.svelte';
  import { contourPaths } from '$lib/project/contour';
  import { addOutline } from '../edit-actions';
  import { formatCombo } from '../lib/keys';
  import { canvas } from '../state/canvas.svelte';
  import { editor } from '../state/editor.svelte';
  import { ui } from '../state/ui.svelte';

  /** Outline: one cut line around everything selected, previewed live on the bed. */
  let { disabled }: { disabled: boolean } = $props();

  const selected = $derived(editor.project?.objects.filter((o) => editor.selection.has(o.id)) ?? []);
  const count = $derived(selected.length);

  $effect(() => {
    canvas.outlinePreview = ui.outlineOpen && count > 0 ? contourPaths(selected, ui.outline) : null;
  });

  function apply() {
    if (addOutline(ui.outline)) ui.outlineOpen = false;
  }
</script>

<Popover.Root bind:open={ui.outlineOpen}>
  <Popover.Trigger
    class="icon-btn tool"
    aria-label={count ? `Outline (${formatCombo('O')})` : 'Outline: select objects first'}
    aria-pressed={ui.outlineOpen}
    disabled={disabled || count === 0}
    data-testid="tool-outline"
  >
    <SquircleDashed size={18} />
  </Popover.Trigger>
  <Popover.Portal>
    <Popover.Content
      class="ol-menu outline-menu"
      side="right"
      align="start"
      sideOffset={8}
      interactOutsideBehavior="ignore"
      data-testid="outline-menu"
    >
      <div class="head">
        <h3>Outline</h3>
        <span class="muted">{count} {count === 1 ? 'object' : 'objects'}</span>
      </div>
      <NumberField
        label="Offset"
        unit="mm"
        decimals={2}
        step={0.5}
        min={-50}
        max={100}
        value={ui.outline.offset}
        presets={[0, 1, 2, 3, 5, 10]}
        presetLabel={(v) => `${v} mm`}
        onchange={(v) => (ui.outline = { ...ui.outline, offset: v })}
        testid="outline-offset"
      />
      <div class="segmented" role="group" aria-label="Corners">
        <button
          type="button"
          aria-pressed={ui.outline.corners === 'round'}
          onclick={() => (ui.outline = { ...ui.outline, corners: 'round' })}>Round</button
        >
        <button
          type="button"
          aria-pressed={ui.outline.corners === 'miter'}
          onclick={() => (ui.outline = { ...ui.outline, corners: 'miter' })}>Sharp</button
        >
      </div>
      <Toggle
        label="Outer edge only"
        checked={ui.outline.outerOnly}
        onchange={(v) => (ui.outline = { ...ui.outline, outerOnly: v })}
        testid="outline-outer"
      />
      <div class="actions">
        <button type="button" class="btn" onclick={() => (ui.outlineOpen = false)}>Cancel</button>
        <button
          type="button"
          class="btn start"
          disabled={!canvas.outlinePreview?.length}
          onclick={apply}
          data-testid="outline-apply">Add outline</button
        >
      </div>
    </Popover.Content>
  </Popover.Portal>
</Popover.Root>

<style>
  :global(.outline-menu) {
    width: 260px;
    min-width: 0;
    padding: 14px;
    display: flex;
    flex-direction: column;
    gap: 12px;
  }

  .head {
    display: flex;
    justify-content: space-between;
    align-items: baseline;
  }

  h3 {
    margin: 0;
    font-size: var(--ol-fs-md);
    font-weight: 600;
  }

  .muted {
    font-size: var(--ol-fs-sm);
  }

  .actions {
    display: flex;
    justify-content: flex-end;
    gap: 8px;
  }
</style>
