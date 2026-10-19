<script lang="ts">
  import { tick } from 'svelte';
  import Printer from '@lucide/svelte/icons/printer';
  import Dialog from '$lib/ui/Dialog.svelte';
  import { ui } from '../state/ui.svelte';

  async function print() {
    ui.printOpen = false;
    ui.printing = true;
    await tick();
    // Embedded images must finish loading or they print blank.
    await Promise.all(
      [...document.querySelectorAll<SVGImageElement>('.print-sheet image')].map(
        (img) =>
          new Promise((resolve) => {
            const probe = new Image();
            probe.onload = probe.onerror = resolve;
            probe.src = img.getAttribute('href') ?? '';
          }),
      ),
    );
    const done = () => {
      ui.printing = false;
      window.removeEventListener('afterprint', done);
    };
    window.addEventListener('afterprint', done);
    window.print();
  }
</script>

<Dialog bind:open={ui.printOpen} title="Print template" width={400} testid="print-dialog">
  <div class="segmented" role="group" aria-label="Scale">
    <button
      type="button"
      aria-pressed={ui.print.scale === 'actual'}
      onclick={() => (ui.print.scale = 'actual')}>Actual size</button
    >
    <button type="button" aria-pressed={ui.print.scale === 'fit'} onclick={() => (ui.print.scale = 'fit')}
      >Fit to page</button
    >
  </div>
  <p class="note">Set the printer to 100% scale. The 50 mm bar checks it.</p>
  {#snippet footer()}
    <button type="button" class="btn" onclick={() => (ui.printOpen = false)}>Cancel</button>
    <button type="button" class="btn start" onclick={print}><Printer size={16} />Print</button>
  {/snippet}
</Dialog>

<style>
  .note {
    margin-top: 12px;
    color: var(--ol-text-muted);
  }
</style>
