<script lang="ts">
  import { Popover } from 'bits-ui';
  import { LAYER_PALETTE } from '$lib/import/layer-defaults';

  interface Props {
    color: string;
    label: string;
    onchange: (color: string) => void;
  }

  let { color, label, onchange }: Props = $props();
  let open = $state(false);
  let hex = $state('');

  function commitHex() {
    const value = hex.trim().startsWith('#') ? hex.trim() : `#${hex.trim()}`;
    if (/^#[0-9a-f]{6}$/i.test(value)) {
      onchange(value.toUpperCase());
      open = false;
    }
  }
</script>

<Popover.Root bind:open onOpenChange={(o) => o && (hex = color)}>
  <Popover.Trigger class="swatch" style="background: {color}" aria-label="{label} color" title="Color" />
  <Popover.Portal>
    <Popover.Content class="ol-menu swatches" sideOffset={6} align="start">
      <div class="grid">
        {#each LAYER_PALETTE as entry (entry.color)}
          <button
            type="button"
            class="chip"
            class:on={entry.color.toLowerCase() === color.toLowerCase()}
            style="background: {entry.color}"
            aria-label={entry.name}
            title={entry.name}
            onclick={() => {
              onchange(entry.color);
              open = false;
            }}
          ></button>
        {/each}
      </div>
      <input
        class="input mono hex"
        aria-label="Hex color"
        bind:value={hex}
        onkeydown={(e) => e.key === 'Enter' && commitHex()}
        onblur={commitHex}
      />
    </Popover.Content>
  </Popover.Portal>
</Popover.Root>

<style>
  :global(.swatch) {
    width: 14px;
    height: 14px;
    border-radius: 4px;
    border: 1px solid var(--ol-border-strong);
    padding: 0;
    flex-shrink: 0;
  }

  :global(.swatches) {
    min-width: 0 !important;
    width: 176px;
    display: flex;
    flex-direction: column;
    gap: 8px;
  }

  .grid {
    display: grid;
    grid-template-columns: repeat(4, 1fr);
    gap: 6px;
  }

  .chip {
    aspect-ratio: 1;
    border-radius: 6px;
    border: 2px solid transparent;
    padding: 0;
  }

  .chip.on {
    border-color: var(--ol-text);
  }

  .hex {
    height: 30px;
  }
</style>
