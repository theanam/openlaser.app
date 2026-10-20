<script lang="ts">
  import CircleHelp from '@lucide/svelte/icons/circle-help';
  import { ui } from '../state/ui.svelte';
</script>

<button
  type="button"
  class="btn ghost help"
  onclick={() => (ui.connectHelpOpen = true)}
  data-testid="connect-help-open"><CircleHelp size={16} />Laser not showing up?</button
>

<style>
  .help {
    width: 100%;
    border-color: transparent;
    color: var(--ol-text-muted);
    transition:
      color 0.15s,
      background 0.15s;
  }

  .help:hover:not(:disabled) {
    border-color: transparent;
    background: var(--ol-surface-2);
    color: var(--ol-text);
  }
</style>
