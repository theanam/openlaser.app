<script lang="ts">
  import type { Asset } from '$lib/project/types';
  import { designPrintSvg } from '../lib/print-svg';
  import { editor } from '../state/editor.svelte';
  import { profiles } from '../state/profiles.svelte';
  import { ui } from '../state/ui.svelte';

  const urls = new Map<string, string>();
  const href = (asset: Asset) => {
    let url = urls.get(asset.id);
    if (!url) {
      url = URL.createObjectURL(asset.data);
      urls.set(asset.id, url);
    }
    return url;
  };

  const sheet = $derived(
    ui.printing && editor.project ? designPrintSvg(editor.project, profiles.active, href) : null,
  );
  const fit = $derived(ui.print.scale === 'fit');

  $effect(() => {
    if (!ui.printing) {
      for (const url of urls.values()) URL.revokeObjectURL(url);
      urls.clear();
    }
  });
</script>

{#if sheet}
  <div class="print-sheet" class:fit>
    <!-- eslint-disable-next-line svelte/no-at-html-tags -- SVG built by print-svg.ts with every text value escaped. -->
    {@html sheet.svg}
  </div>
{/if}

<style>
  .print-sheet {
    display: none;
  }

  @media print {
    @page {
      margin: 10mm;
    }

    .print-sheet {
      display: block;
      background: white;
    }

    .print-sheet.fit :global(svg) {
      width: 100%;
      height: auto;
      max-height: 100vh;
    }
  }
</style>
