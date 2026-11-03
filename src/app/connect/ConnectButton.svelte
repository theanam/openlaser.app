<script lang="ts">
  import { DropdownMenu } from 'bits-ui';
  import Usb from '@lucide/svelte/icons/usb';
  import Bluetooth from '@lucide/svelte/icons/bluetooth';
  import ChevronDown from '@lucide/svelte/icons/chevron-down';
  import LoaderCircle from '@lucide/svelte/icons/loader-circle';
  import Check from '@lucide/svelte/icons/check';
  import { autoConnect, type ConnectMethod } from '../machines/connect.svelte';

  /**
   * Connect laser, with USB or Bluetooth in its menu. The button uses the last method; the machine
   * is detected either way.
   */
  let {
    size = 'cta',
    testid = 'connect',
    before,
  }: { size?: 'small' | 'cta' | 'big'; testid?: string; before?: () => void } = $props();

  function go(method?: ConnectMethod) {
    before?.();
    void autoConnect.connect(method);
  }

  const LABELS: Record<ConnectMethod, string> = { usb: 'USB', bluetooth: 'Bluetooth' };
  const ICONS = { usb: Usb, bluetooth: Bluetooth };
  const Icon = $derived(ICONS[autoConnect.method]);
  const methods = $derived(autoConnect.methods);
  const busy = $derived(autoConnect.busy);
  const iconSize = $derived(size === 'big' ? 18 : size === 'small' ? 15 : 16);
</script>

{#if methods.length}
  <div class="split {size}" data-testid={testid}>
    <button
      type="button"
      class="btn signal main {size === 'small' ? 'small' : size}"
      disabled={busy}
      title="Connect over {LABELS[autoConnect.method]}"
      aria-busy={busy}
      onclick={() => go()}
      data-testid="{testid}-main"
    >
      {#if busy}<LoaderCircle size={iconSize} class="spin" />{autoConnect.detecting
          ? 'Detecting…'
          : 'Connecting…'}
      {:else}<Icon size={iconSize} />Connect laser{/if}
    </button>
    {#if methods.length > 1}
      <DropdownMenu.Root>
        <DropdownMenu.Trigger
          class="btn signal more {size === 'small' ? 'small' : size}"
          disabled={busy}
          aria-label="Connect over"
          data-testid="{testid}-menu"><ChevronDown size={iconSize} /></DropdownMenu.Trigger
        >
        <DropdownMenu.Portal>
          <DropdownMenu.Content class="ol-menu connect-menu" sideOffset={6} align="end">
            {#each methods as method (method)}
              {@const ItemIcon = ICONS[method]}
              <DropdownMenu.Item
                class="connect-item"
                onSelect={() => go(method)}
                data-testid="{testid}-{method}"
              >
                <ItemIcon size={16} />
                <span>{LABELS[method]}</span>
                {#if !autoConnect.ready(method)}<span class="setup">Set up</span>
                {:else if method === autoConnect.method}<Check size={15} class="current" />{/if}
              </DropdownMenu.Item>
            {/each}
          </DropdownMenu.Content>
        </DropdownMenu.Portal>
      </DropdownMenu.Root>
    {/if}
  </div>
{/if}

<style>
  .split {
    display: inline-flex;
    align-items: stretch;
  }

  .split.cta {
    display: flex;
  }

  .main {
    flex: 1;
    gap: 6px;
  }

  .split:has(:global(.more)) .main {
    border-top-right-radius: 0;
    border-bottom-right-radius: 0;
  }

  :global(.split .more) {
    border-top-left-radius: 0;
    border-bottom-left-radius: 0;
    border-left: 1px solid color-mix(in srgb, var(--ol-on-signal) 30%, transparent);
    padding-left: 8px;
    padding-right: 8px;
  }

  :global(.connect-menu) {
    min-width: max(180px, var(--bits-dropdown-menu-anchor-width, 0px));
  }

  :global(.connect-item) {
    display: grid;
    grid-template-columns: 16px 1fr auto;
    align-items: center;
    gap: 10px;
    padding: 8px 10px;
    border-radius: var(--ol-radius-sm);
    cursor: pointer;
    outline: none;
    color: var(--ol-text);
  }

  :global(.connect-item > svg:first-child) {
    color: var(--ol-text-muted);
  }

  :global(.connect-item[data-highlighted]) {
    background: var(--ol-surface-2);
  }

  :global(.connect-item .setup) {
    font-size: var(--ol-fs-xs);
    color: var(--ol-text-muted);
  }

  :global(.connect-item .current) {
    color: var(--ol-signal);
  }

  :global(.split .spin) {
    animation: spin 1s linear infinite;
  }

  @keyframes spin {
    to {
      transform: rotate(360deg);
    }
  }
</style>
