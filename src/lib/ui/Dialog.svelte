<script lang="ts">
  import { Dialog } from 'bits-ui';
  import X from '@lucide/svelte/icons/x';
  import type { Snippet } from 'svelte';

  interface Props {
    open: boolean;
    title: string;
    description?: string;
    width?: number;
    /** Escape and outside clicks close the dialog unless this is false. */
    dismissible?: boolean;
    children: Snippet;
    footer?: Snippet;
    onclose?: () => void;
    testid?: string;
  }

  let {
    open = $bindable(),
    title,
    description,
    width = 480,
    dismissible = true,
    children,
    footer,
    onclose,
    testid,
  }: Props = $props();

  function onOpenChange(next: boolean) {
    open = next;
    if (!next) onclose?.();
  }
</script>

<Dialog.Root {open} {onOpenChange}>
  <Dialog.Portal>
    <Dialog.Overlay class="ol-dialog-overlay" />
    <Dialog.Content
      class="ol-dialog"
      style="--dialog-w: {width}px"
      escapeKeydownBehavior={dismissible ? 'close' : 'ignore'}
      interactOutsideBehavior={dismissible ? 'close' : 'ignore'}
      data-testid={testid}
    >
      <header class="ol-dialog-head">
        <div>
          <Dialog.Title class="ol-dialog-title">{title}</Dialog.Title>
          {#if description}
            <Dialog.Description class="ol-dialog-desc">{description}</Dialog.Description>
          {/if}
        </div>
        {#if dismissible}
          <Dialog.Close class="icon-btn sm" aria-label="Close">
            <X size={16} />
          </Dialog.Close>
        {/if}
      </header>
      <div class="ol-dialog-body">
        {@render children()}
      </div>
      {#if footer}
        <footer class="ol-dialog-foot">{@render footer()}</footer>
      {/if}
    </Dialog.Content>
  </Dialog.Portal>
</Dialog.Root>

<style>
  :global(.ol-dialog-overlay) {
    position: fixed;
    inset: 0;
    z-index: 50;
    background: var(--ol-overlay);
  }

  :global(.ol-dialog) {
    position: fixed;
    z-index: 51;
    left: 50%;
    top: 50%;
    transform: translate(-50%, -50%);
    width: min(var(--dialog-w), calc(100vw - 32px));
    max-height: calc(100vh - 48px);
    display: flex;
    flex-direction: column;
    background: var(--ol-surface);
    color: var(--ol-text);
    border: 1px solid var(--ol-border);
    border-radius: var(--ol-radius-lg);
    box-shadow: var(--ol-shadow-pop);
    outline: none;
  }

  :global(.ol-dialog-head) {
    display: flex;
    justify-content: space-between;
    align-items: flex-start;
    gap: 12px;
    padding: 16px 16px 8px 20px;
  }

  :global(.ol-dialog-title) {
    margin: 0;
    font-size: var(--ol-fs-lg);
    font-weight: 600;
  }

  :global(.ol-dialog-desc) {
    margin: 4px 0 0;
    color: var(--ol-text-muted);
  }

  :global(.ol-dialog-body) {
    padding: 8px 20px 16px;
    overflow: auto;
  }

  :global(.ol-dialog-foot) {
    display: flex;
    justify-content: flex-end;
    gap: 8px;
    padding: 12px 20px 16px;
    border-top: 1px solid var(--ol-border);
  }
</style>
