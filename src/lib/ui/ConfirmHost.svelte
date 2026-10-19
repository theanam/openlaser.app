<script lang="ts">
  import { AlertDialog } from 'bits-ui';
  import { confirms } from './confirm.svelte';

  const current = $derived(confirms.current);
</script>

<AlertDialog.Root open={current !== null} onOpenChange={(open) => !open && confirms.answer(false)}>
  <AlertDialog.Portal>
    <AlertDialog.Overlay class="ol-dialog-overlay" />
    <AlertDialog.Content class="ol-dialog" style="--dialog-w: 420px" data-testid="confirm-dialog">
      {#if current}
        <header class="ol-dialog-head">
          <AlertDialog.Title class="ol-dialog-title">{current.title}</AlertDialog.Title>
        </header>
        <AlertDialog.Description class="ol-dialog-body confirm-message"
          >{current.message}</AlertDialog.Description
        >
        <footer class="ol-dialog-foot">
          <AlertDialog.Cancel class="btn">{current.cancelLabel ?? 'Cancel'}</AlertDialog.Cancel>
          <AlertDialog.Action
            class="btn {current.tone === 'danger' ? 'signal' : 'start'}"
            onclick={() => confirms.answer(true)}
          >
            {current.confirmLabel ?? 'OK'}
          </AlertDialog.Action>
        </footer>
      {/if}
    </AlertDialog.Content>
  </AlertDialog.Portal>
</AlertDialog.Root>

<style>
  :global(.confirm-message) {
    color: var(--ol-text-2);
    line-height: 1.55;
    white-space: pre-line;
  }
</style>
