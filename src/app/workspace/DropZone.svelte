<script lang="ts">
  import { onMount } from 'svelte';
  import Download from '@lucide/svelte/icons/download';
  import { importFiles } from '../actions';

  let depth = $state(0);

  const hasFiles = (e: DragEvent) => e.dataTransfer?.types.includes('Files') ?? false;

  onMount(() => {
    const enter = (e: DragEvent) => {
      if (!hasFiles(e)) return;
      e.preventDefault();
      depth++;
    };
    const over = (e: DragEvent) => {
      if (hasFiles(e)) e.preventDefault();
    };
    const leave = (e: DragEvent) => {
      if (hasFiles(e)) depth = Math.max(0, depth - 1);
    };
    const drop = async (e: DragEvent) => {
      if (!hasFiles(e)) return;
      e.preventDefault();
      depth = 0;
      const items = [...(e.dataTransfer?.items ?? [])];
      const files = await Promise.all(
        items
          .filter((item) => item.kind === 'file')
          .map(async (item) => {
            const file = item.getAsFile()!;
            // Chromium hands out a writable handle, so a dropped .olaser can be saved in place.
            const getHandle = (
              item as DataTransferItem & { getAsFileSystemHandle?: () => Promise<FileSystemHandle | null> }
            ).getAsFileSystemHandle;
            const handle = getHandle ? await getHandle.call(item).catch(() => null) : null;
            return {
              file,
              handle: handle && handle.kind === 'file' ? (handle as FileSystemFileHandle) : undefined,
            };
          }),
      );
      await importFiles(files);
    };
    window.addEventListener('dragenter', enter);
    window.addEventListener('dragover', over);
    window.addEventListener('dragleave', leave);
    window.addEventListener('drop', drop);
    return () => {
      window.removeEventListener('dragenter', enter);
      window.removeEventListener('dragover', over);
      window.removeEventListener('dragleave', leave);
      window.removeEventListener('drop', drop);
    };
  });
</script>

{#if depth > 0}
  <div class="drop" aria-hidden="true">
    <div class="card">
      <Download size={22} /><span>Drop to import</span><span class="mono dim"
        >SVG · PNG · JPEG · WebP · AVIF · BMP · GIF · G-code · .olaser</span
      >
    </div>
  </div>
{/if}

<style>
  .drop {
    position: fixed;
    inset: 0;
    z-index: 70;
    display: flex;
    align-items: center;
    justify-content: center;
    background: var(--ol-overlay);
    pointer-events: none;
  }

  .card {
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 10px;
    padding: 32px 48px;
    border-radius: var(--ol-radius-xl);
    border: 2px dashed var(--ol-beam);
    background: var(--ol-surface);
    font-size: var(--ol-fs-lg);
    font-weight: 600;
  }

  .card :global(svg) {
    color: var(--ol-beam);
  }

  .dim {
    font-size: var(--ol-fs-sm);
    font-weight: 400;
  }
</style>
